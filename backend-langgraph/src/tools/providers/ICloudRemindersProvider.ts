import { DAVClient, DAVCalendar, DAVCalendarObject } from 'tsdav';
import { randomUUID } from 'crypto';
import { ICloudTokenRepository } from '../../repositories/ICloudTokenRepository';
import { UserPreferencesRepository } from '../../repositories/UserPreferencesRepository';
import {
  TasksProvider,
  TasksAddParams,
  TasksListParams,
  TasksCompleteParams,
  TasksDeleteParams,
} from './TasksProvider';
import { ToolResult } from '../../types/tools';

interface ParsedTask {
  id: string;
  href: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'NEEDS-ACTION' | 'COMPLETED';
  listName: string;
}

// Tasks are stored as VEVENT in Apple Calendar with [Task] prefix and CATEGORIES:TASK.
// This bypasses unreliable VTODO CalDAV sync on iCloud and uses the proven VEVENT path.
export class ICloudRemindersProvider implements TasksProvider {
  constructor(
    private tokenRepo: ICloudTokenRepository,
    private prefRepo: UserPreferencesRepository,
  ) {}

  private async getClient(userId: string): Promise<DAVClient> {
    const creds = await this.tokenRepo.get(userId);
    if (!creds) throw new Error('Apple iCloud not connected. Please connect your Apple account in Settings.');
    const client = new DAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: creds.appleId, password: creds.appPassword },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    await client.login();
    return client;
  }

  private async getCalendarHref(
    client: DAVClient,
    userId: string,
    isShoppingList: boolean,
  ): Promise<string> {
    const creds = await this.tokenRepo.get(userId);
    // Tasks are stored as VEVENT — reuse the same calendar as regular events
    const eventHref = isShoppingList ? creds?.shoppingCalHref : creds?.calendarHref;
    if (eventHref) return eventHref;

    // Fallback: first available VEVENT calendar
    const calendars: DAVCalendar[] = await client.fetchCalendars();
    const veventCals = calendars.filter((c) => (c.components ?? []).includes('VEVENT'));
    if (veventCals.length === 0) {
      throw new Error('No Apple Calendar found. Please create a calendar in the Calendar app on your iPhone or Mac.');
    }
    return veventCals[0].url;
  }

  private buildVEVENT(uid: string, title: string, due: string, notes?: string, status = 'NEEDS-ACTION'): string {
    // Use the due date as an all-day event date; if completed set a special category
    const dateStr = due.replace(/-/g, '');
    const nextDay = new Date(due);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateStr = nextDay.toISOString().slice(0, 10).replace(/-/g, '');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TravelAgent//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:[Task] ${title}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${nextDateStr}`,
      notes ? `DESCRIPTION:${notes}` : '',
      `CATEGORIES:TASK${status === 'COMPLETED' ? ',COMPLETED' : ''}`,
      status === 'COMPLETED' ? 'STATUS:COMPLETED' : 'STATUS:TENTATIVE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);
    return lines.join('\r\n');
  }

  private parseTaskEvent(icsString: string, href: string): ParsedTask | null {
    if (!icsString.includes('BEGIN:VEVENT')) return null;
    const lines = icsString.replace(/\r\n/g, '\n').split('\n');

    const summary = lines.find((l) => l.startsWith('SUMMARY:'))?.slice(8).trim() ?? '';
    // Only handle events we created as tasks
    if (!summary.startsWith('[Task] ')) return null;

    const uid = lines.find((l) => l.startsWith('UID:'))?.slice(4).trim() ?? href;
    const title = summary.slice(7); // strip "[Task] "
    const notes = lines.find((l) => l.startsWith('DESCRIPTION:'))?.slice(12).trim();
    const categories = lines.find((l) => l.startsWith('CATEGORIES:'))?.slice(11).trim() ?? '';
    const statusLine = lines.find((l) => l.startsWith('STATUS:'))?.slice(7).trim();
    const dtstart = lines.find((l) => l.startsWith('DTSTART'))?.replace(/^DTSTART[^:]*:/, '').trim() ?? '';

    let due: string | undefined;
    if (dtstart.length >= 8) {
      due = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    }

    const isCompleted = categories.includes('COMPLETED') || statusLine === 'COMPLETED';
    const status: ParsedTask['status'] = isCompleted ? 'COMPLETED' : 'NEEDS-ACTION';

    return { id: uid, href, title, notes, due, status, listName: '' };
  }

  async add(params: TasksAddParams): Promise<ToolResult> {
    const { userId, title, notes, due, tasklistName } = params;
    if (!due) return { success: false, error: 'MISSING_DUE_DATE: Ask the user for a due date before calling this tool.' };
    try {
      const client = await this.getClient(userId);
      const prefs = await this.prefRepo.get(userId);
      const listName = tasklistName ?? prefs.taskListName;
      const isShopping = listName.toLowerCase() === prefs.shoppingTaskListName.toLowerCase();
      const calHref = await this.getCalendarHref(client, userId, isShopping);

      const uid = randomUUID();
      const icsData = this.buildVEVENT(uid, title, due, notes);

      await client.createCalendarObject({
        calendar: { url: calHref } as DAVCalendar,
        filename: `${uid}.ics`,
        iCalString: icsData,
      });

      return {
        success: true,
        data: {
          source: 'icloud',
          taskId: uid,
          title,
          due,
          list: listName,
          viewUrl: 'https://www.icloud.com/calendar/',
          message: `Task "${title}" added to Apple Calendar on ${due} — look for "[Task] ${title}" on that date.`,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async list(params: TasksListParams): Promise<ToolResult> {
    const { userId, includeCompleted = false } = params;
    try {
      const client = await this.getClient(userId);
      const calendars: DAVCalendar[] = await client.fetchCalendars();
      const veventCals = calendars.filter((c) => (c.components ?? []).includes('VEVENT'));
      const tasks: ParsedTask[] = [];

      for (const cal of veventCals) {
        const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar: cal });
        for (const obj of objects) {
          const parsed = this.parseTaskEvent(obj.data as string, obj.url);
          if (!parsed) continue;
          if (!includeCompleted && parsed.status === 'COMPLETED') continue;
          tasks.push(parsed);
        }
      }

      return {
        success: true,
        data: {
          source: 'icloud',
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            notes: t.notes,
            due: t.due,
            status: t.status,
          })),
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async complete(params: TasksCompleteParams): Promise<ToolResult> {
    const { userId, taskId } = params;
    try {
      const client = await this.getClient(userId);
      const calendars: DAVCalendar[] = await client.fetchCalendars();
      const veventCals = calendars.filter((c) => (c.components ?? []).includes('VEVENT'));

      for (const cal of veventCals) {
        const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar: cal });
        const target = objects.find((o) => {
          const uid = (o.data as string).split('\n').find((l) => l.startsWith('UID:'))?.slice(4).trim();
          return uid === taskId || o.url.includes(taskId);
        });
        if (!target) continue;
        const parsed = this.parseTaskEvent(target.data as string, target.url);
        if (!parsed) continue;
        const updatedICS = this.buildVEVENT(parsed.id, parsed.title, parsed.due ?? new Date().toISOString().slice(0, 10), parsed.notes, 'COMPLETED');
        await client.updateCalendarObject({ calendarObject: { ...target, data: updatedICS } });
        return { success: true, data: { source: 'icloud', message: `Task "${parsed.title}" marked as completed.` } };
      }

      return { success: false, error: `Task not found: ${taskId}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async delete(params: TasksDeleteParams): Promise<ToolResult> {
    const { userId, taskId } = params;
    try {
      const client = await this.getClient(userId);
      const calendars: DAVCalendar[] = await client.fetchCalendars();
      const veventCals = calendars.filter((c) => (c.components ?? []).includes('VEVENT'));

      for (const cal of veventCals) {
        const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar: cal });
        const target = objects.find((o) => {
          const uid = (o.data as string).split('\n').find((l) => l.startsWith('UID:'))?.slice(4).trim();
          return uid === taskId || o.url.includes(taskId);
        });
        if (target) {
          await client.deleteCalendarObject({ calendarObject: target });
          return { success: true, data: { source: 'icloud', message: `Task deleted from Apple Calendar.` } };
        }
      }

      return { success: false, error: `Task not found: ${taskId}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
