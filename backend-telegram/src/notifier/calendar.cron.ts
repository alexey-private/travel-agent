import cron from 'node-cron';
import type { Api } from 'grammy';
import { BACKEND_URL } from '../config';
import { internalHeaders } from '../backendAuth';
import { fetchLocale } from '../i18n/language';
import { t } from '../i18n/t';
import type { Locale } from '../i18n/config';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM
}

interface Task {
  id: string;
  title: string;
  due?: string;       // ISO string or YYYY-MM-DD
  status: string;
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isTomorrow(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === tomorrowDate();
}

async function fetchTomorrowReminders(sessionId: string): Promise<{ events: CalendarEvent[]; tasks: Task[] }> {
  const [eventsRes, tasksRes] = await Promise.all([
    fetch(`${BACKEND_URL}/api/calendar/events?userId=${encodeURIComponent(sessionId)}`, { headers: internalHeaders() }),
    fetch(`${BACKEND_URL}/api/calendar/tasks?userId=${encodeURIComponent(sessionId)}`, { headers: internalHeaders() }),
  ]);

  const eventsData = eventsRes.ok ? (await eventsRes.json() as { upcoming?: CalendarEvent[]; events?: CalendarEvent[] }) : {};
  const tasksData  = tasksRes.ok  ? (await tasksRes.json()  as { tasks?: Task[] }) : {};

  const allEvents: CalendarEvent[] = eventsData.upcoming ?? eventsData.events ?? [];
  const allTasks: Task[]           = tasksData.tasks ?? [];

  return {
    events: allEvents.filter((e) => isTomorrow(e.date)),
    tasks:  allTasks.filter((t) => t.status !== 'completed' && isTomorrow(t.due)),
  };
}

function formatNotification(events: CalendarEvent[], tasks: Task[], locale: Locale): string {
  const lines: string[] = [t(locale, 'notify.header')];

  if (events.length > 0) {
    lines.push(t(locale, 'notify.events'));
    for (const e of events) {
      lines.push(`  • ${e.time ? `${e.time} — ` : ''}${e.title}`);
    }
  }

  if (tasks.length > 0) {
    if (events.length > 0) lines.push('');
    lines.push(t(locale, 'notify.tasks'));
    for (const t of tasks) {
      lines.push(`  • ${t.title}`);
    }
  }

  return lines.join('\n');
}

export function startCalendarCron(api: Api): void {
  const hour = parseInt(process.env.NOTIFY_HOUR ?? '9', 10);
  // Runs daily at the configured hour (default 9:00 AM server time)
  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log('[cron] Running calendar notification check…');

    let sessionIds: string[];
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/telegram`, { headers: internalHeaders() });
      if (!res.ok) throw new Error(`Backend error: ${res.status}`);
      const data = await res.json() as { sessionIds: string[] };
      sessionIds = data.sessionIds;
    } catch (err) {
      console.error('[cron] Failed to fetch telegram users:', err);
      return;
    }

    console.log(`[cron] Checking ${sessionIds.length} Telegram user(s)…`);

    for (const sessionId of sessionIds) {
      const telegramId = parseInt(sessionId.slice(3), 10);
      if (isNaN(telegramId)) continue;

      try {
        const { events, tasks } = await fetchTomorrowReminders(sessionId);
        if (events.length === 0 && tasks.length === 0) continue;

        // No grammY context here — the recipient's language comes straight
        // from their stored settings, keyed by the same tg-<id> session id.
        const locale = await fetchLocale(sessionId);
        const text = formatNotification(events, tasks, locale);
        await api.sendMessage(telegramId, text, { parse_mode: 'HTML' });
        console.log(`[cron] Notified tg user ${telegramId}: ${events.length} event(s), ${tasks.length} task(s)`);
      } catch (err) {
        console.error(`[cron] Failed for user ${sessionId}:`, err);
      }
    }
  });

  console.log(`[cron] Calendar notifications scheduled at ${hour}:00 daily`);
}
