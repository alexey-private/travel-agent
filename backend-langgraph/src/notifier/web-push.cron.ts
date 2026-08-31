import cron from 'node-cron';
import webpush from 'web-push';
import type { Pool } from 'pg';
import type { CalendarProvider } from '../tools/providers/CalendarProvider';
import type { TasksProvider } from '../tools/providers/TasksProvider';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@travel-agent/i18n';
import { notificationTitle, notificationOverflow, formatEventTime } from '../i18n/notifications';
import { forEachWithConcurrency } from '../utils/concurrency';

/**
 * How many people the run has in flight at once.
 *
 * Each one costs two provider calls, so this is the number of calendar and task
 * requests in the air, not a count of local work — which is why it is five and
 * not fifty. It divides the run's wall clock by five; raising it further trades
 * a shorter run for a better chance that Google rate-limits the whole batch.
 */
const USER_CONCURRENCY = 5;

interface PushSubscriptionRow {
  id: string;
  session_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language: string | null;
}

/**
 * Tomorrow's date, as the server's own calendar reads it.
 *
 * Exported so the boundary can be tested without standing up the cron.
 *
 * The day has to be counted in one clock throughout. `toISOString()` was the
 * bug: it renders in UTC, so a server far enough east reported today and one
 * far enough west reported the day after. At the default 09:00 run, east means
 * any offset past nine hours — Adelaide's UTC+9:30 included, and all of eastern
 * Australia and New Zealand, whose users were told about the events they were
 * already having.
 *
 * Local is the right clock of the two available. The cron fires on local time
 * and a calendar's all-day dates are local to whoever wrote them; the server's
 * timezone is only ever an approximation of the user's, but UTC is not even
 * that.
 */
export function tomorrowDate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);

  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function isTomorrow(dateStr: string | undefined): boolean {
  return !!dateStr && dateStr.slice(0, 10) === tomorrowDate();
}

/**
 * Exported so the copy can be checked without standing up the cron.
 *
 * Only the wrapping is translated. Event and task titles are the user's own
 * words, in whatever language they wrote them, and are passed through untouched.
 */
export function buildPayload(
  events: { title: string; time?: string }[],
  tasks: { title: string }[],
  locale: Locale,
): string {
  const lines: string[] = [];

  if (events.length > 0) {
    lines.push(...events.map((e) => (e.time ? `${formatEventTime(locale, e.time)} ${e.title}` : e.title)));
  }
  if (tasks.length > 0) {
    lines.push(...tasks.map((t) => `✅ ${t.title}`));
  }

  const shown = lines.slice(0, 3);
  const hidden = lines.length - shown.length;
  const body = hidden > 0
    ? `${shown.join('\n')}\n${notificationOverflow(locale, hidden)}`
    : shown.join('\n');

  return JSON.stringify({ title: notificationTitle(locale), body, url: '/' });
}

export function startWebPushCron(
  pool: Pool,
  calendarProvider: CalendarProvider,
  tasksProvider: TasksProvider,
): void {
  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail      = process.env.VAPID_EMAIL ?? 'mailto:admin@example.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[web-push cron] VAPID keys not configured — skipping cron registration');
    return;
  }

  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  const hour = parseInt(process.env.NOTIFY_HOUR ?? '9', 10);

  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log('[web-push cron] Running calendar notification check…');

    let rows: PushSubscriptionRow[];
    try {
      const result = await pool.query<PushSubscriptionRow>(
        // LEFT JOIN, not JOIN: a subscription exists whether or not the person
        // ever opened the settings page. With no preferences row the language
        // comes back NULL and they get an English notification, not none.
        `SELECT ps.id, u.session_id, ps.endpoint, ps.p256dh, ps.auth, p.language
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
         LEFT JOIN user_service_preferences p ON p.user_id = u.session_id`,
      );
      rows = result.rows;
    } catch (err) {
      console.error('[web-push cron] Failed to fetch subscriptions:', err);
      return;
    }

    console.log(`[web-push cron] ${rows.length} subscription(s) to notify`);

    // Group subscriptions by session_id so we only fetch calendar data once per user
    const byUser = new Map<string, PushSubscriptionRow[]>();
    for (const row of rows) {
      const list = byUser.get(row.session_id) ?? [];
      list.push(row);
      byUser.set(row.session_id, list);
    }

    async function notify(
      sessionId: string,
      subscriptions: PushSubscriptionRow[],
    ): Promise<void> {
      let events: { title: string; date: string; time?: string }[] = [];
      let tasks:  { title: string; due?: string; status: string }[] = [];

      try {
        const [eventsResult, tasksResult] = await Promise.all([
          calendarProvider.list({ userId: sessionId }),
          tasksProvider.list({ userId: sessionId }),
        ]);

        if (eventsResult.success) {
          const data = eventsResult.data as { upcoming?: typeof events; events?: typeof events };
          events = (data.upcoming ?? data.events ?? []).filter((e) => isTomorrow(e.date));
        }
        if (tasksResult.success) {
          const data = tasksResult.data as { tasks?: typeof tasks };
          tasks = (data.tasks ?? []).filter((t) => t.status !== 'completed' && isTomorrow(t.due));
        }
      } catch (err) {
        // One person's calendar being unreachable is not the run's problem.
        console.error(`[web-push cron] Failed to fetch calendar for ${sessionId}:`, err);
        return;
      }

      if (events.length === 0 && tasks.length === 0) return;

      // Every subscription under one session_id belongs to one person, so the
      // language is the same on all of them — read it off the first.
      const rawLanguage = subscriptions[0]?.language;
      const locale: Locale = isLocale(rawLanguage) ? rawLanguage : DEFAULT_LOCALE;

      const payload = buildPayload(events, tasks, locale);

      // Sequential, deliberately: these are one person's own devices, two or
      // three of them, and the round trips are to a push service rather than to
      // the provider that made the run slow.
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          console.log(`[web-push cron] Notified ${sessionId}: ${events.length} event(s), ${tasks.length} task(s)`);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410) {
            // Subscription expired — clean up
            await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
            console.log(`[web-push cron] Removed stale subscription ${sub.id}`);
          } else {
            console.error(`[web-push cron] Send failed for subscription ${sub.id}:`, err);
          }
        }
      }
    }

    try {
      await forEachWithConcurrency(
        [...byUser],
        USER_CONCURRENCY,
        ([sessionId, subscriptions]) => notify(sessionId, subscriptions),
      );
    } catch (err) {
      // `notify` handles what it expects; this is what it did not — a failed
      // cleanup of a stale subscription, say. The run still reached everyone.
      console.error('[web-push cron] Finished with errors:', err);
    }
  });

  console.log(`[web-push cron] Scheduled at ${hour}:00 daily`);
}
