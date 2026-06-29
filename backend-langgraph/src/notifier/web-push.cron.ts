import cron from 'node-cron';
import webpush from 'web-push';
import type { Pool } from 'pg';
import type { CalendarProvider } from '../tools/providers/CalendarProvider';
import type { TasksProvider } from '../tools/providers/TasksProvider';

interface PushSubscriptionRow {
  id: string;
  session_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isTomorrow(dateStr: string | undefined): boolean {
  return !!dateStr && dateStr.slice(0, 10) === tomorrowDate();
}

function buildPayload(events: { title: string; time?: string }[], tasks: { title: string }[]): string {
  const lines: string[] = [];

  if (events.length > 0) {
    lines.push(...events.map((e) => (e.time ? `${e.time} ${e.title}` : e.title)));
  }
  if (tasks.length > 0) {
    lines.push(...tasks.map((t) => `✅ ${t.title}`));
  }

  const title = "Tomorrow's reminders";
  const body = lines.slice(0, 3).join('\n') + (lines.length > 3 ? `\n…and ${lines.length - 3} more` : '');

  return JSON.stringify({ title, body, url: '/' });
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
        `SELECT ps.id, u.session_id, ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id`,
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

      const payload = buildPayload(events, tasks);

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
