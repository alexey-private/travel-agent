import cron from 'node-cron';
import webpush from 'web-push';
import type { Pool } from 'pg';
import type { CalendarProvider } from '../tools/providers/CalendarProvider';
import type { TasksProvider } from '../tools/providers/TasksProvider';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n/locale';
import { notificationTitle, notificationOverflow, formatEventTime } from '../i18n/notifications';

interface PushSubscriptionRow {
  id: string;
  session_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language: string | null;
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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

    for (const [sessionId, subscriptions] of byUser) {
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
        console.error(`[web-push cron] Failed to fetch calendar for ${sessionId}:`, err);
        continue;
      }

      if (events.length === 0 && tasks.length === 0) continue;

      // Every subscription under one session_id belongs to one person, so the
      // language is the same on all of them — read it off the first.
      const rawLanguage = subscriptions[0]?.language;
      const locale: Locale = isLocale(rawLanguage) ? rawLanguage : DEFAULT_LOCALE;

      const payload = buildPayload(events, tasks, locale);

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
  });

  console.log(`[web-push cron] Scheduled at ${hour}:00 daily`);
}
