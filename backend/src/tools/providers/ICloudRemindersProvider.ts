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

  private async getVtodoCals(client: DAVClient): Promise<DAVCalendar[]> {
    const all: DAVCalendar[] = await client.fetchCalendars();
    return all.filter((c) => c.components?.includes('VTODO'));
  }

  private vtodoFilter() {
    return {
      'comp-filter': {
        _attributes: { name: 'VCALENDAR' },
        'comp-filter': { _attributes: { name: 'VTODO' } },
      },
    };
  }

  private async getReminderListHref(
    client: DAVClient,
    userId: string,
    name: string,
    isShoppingList: boolean,
  ): Promise<string> {
    const creds = await this.tokenRepo.get(userId);
    const cachedHref = isShoppingList ? creds?.shoppingRemHref : creds?.reminderHref;
    if (cachedHref) return cachedHref;

    // Fall back to first available VTODO collection
    const vtodoCals = await this.getVtodoCals(client);
    if (vtodoCals.length === 0) {
      throw new Error('No Reminders lists found in your iCloud account. Please create a list in the Reminders app on your iPhone or Mac first.');
    }
    const fallback = vtodoCals[0];
    const href = fallback.url;
    // Cache it so future calls are fast
    if (isShoppingList) {
      await this.tokenRepo.saveShoppingReminderHref(userId, href);
    } else {
      await this.tokenRepo.saveReminderHref(userId, href);
    }
    return href;
  }

  private parseVTODO(icsString: string, href: string, listName: string): ParsedTask | null {
    if (!icsString.includes('BEGIN:VTODO')) return null;
    const lines = icsString.replace(/\r\n/g, '\n').split('\n');
    const uid = lines.find((l) => l.startsWith('UID:'))?.slice(4).trim() ?? href;
    const summary = lines.find((l) => l.startsWith('SUMMARY:'))?.slice(8).trim() ?? '';
    const notes = lines.find((l) => l.startsWith('DESCRIPTION:'))?.slice(12).trim();
    const dueLine = lines.find((l) => l.startsWith('DUE'));
    const status = (lines.find((l) => l.startsWith('STATUS:'))?.slice(7).trim() ?? 'NEEDS-ACTION') as ParsedTask['status'];

    let due: string | undefined;
    if (dueLine) {
      const dateStr = dueLine.replace(/^DUE[^:]*:/, '').trim();
      if (dateStr.length >= 8) {
        due = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      }
    }

    return { id: uid, href, title: summary, notes, due, status, listName };
  }

  private buildVTODO(uid: string, title: string, notes?: string, due?: string, status = 'NEEDS-ACTION'): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TravelAgent//EN',
      'BEGIN:VTODO',
      `UID:${uid}`,
      `SUMMARY:${title}`,
      notes ? `DESCRIPTION:${notes}` : '',
      due ? `DUE;VALUE=DATE:${due.replace(/-/g, '')}` : '',
      `STATUS:${status}`,
      'END:VTODO',
      'END:VCALENDAR',
    ].filter(Boolean);
    return lines.join('\r\n');
  }

  async add(params: TasksAddParams): Promise<ToolResult> {
    const { userId, title, notes, due, tasklistName } = params;
    try {
      const client = await this.getClient(userId);
      const prefs = await this.prefRepo.get(userId);
      const listName = tasklistName ?? prefs.taskListName;
      const isShopping = listName.toLowerCase() === prefs.shoppingTaskListName.toLowerCase();
      const listHref = await this.getReminderListHref(client, userId, listName, isShopping);

      const uid = randomUUID();
      const icsData = this.buildVTODO(uid, title, notes, due);

      await client.createCalendarObject({
        calendar: { url: listHref } as DAVCalendar,
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
          message: `Task "${title}" added to Apple Reminders (${listName}).`,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async list(params: TasksListParams): Promise<ToolResult> {
    const { userId, tasklistName, includeCompleted = false } = params;
    try {
      const client = await this.getClient(userId);
      const vtodoCals = await this.getVtodoCals(client);
      const tasks: ParsedTask[] = [];

      for (const cal of vtodoCals) {
        if (tasklistName && (String(cal.displayName ?? '')).toLowerCase() !== tasklistName.toLowerCase()) continue;
        const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar: cal, filters: this.vtodoFilter() });
        for (const obj of objects) {
          const parsed = this.parseVTODO(obj.data as string, obj.url, String(cal.displayName ?? ''));
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
            list: t.listName,
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
      const vtodoCals = await this.getVtodoCals(client);

      for (const cal of vtodoCals) {
        const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar: cal, filters: this.vtodoFilter() });
        const target = objects.find((o) => {
          const uid = (o.data as string)
            .split('\n')
            .find((l) => l.startsWith('UID:'))
            ?.slice(4).trim();
          return uid === taskId || o.url.includes(taskId);
        });
        if (target) {
          const parsed = this.parseVTODO(target.data as string, target.url, String(cal.displayName ?? ''));
          if (!parsed) continue;
          const updatedICS = this.buildVTODO(parsed.id, parsed.title, parsed.notes, parsed.due, 'COMPLETED');
          await client.updateCalendarObject({
            calendarObject: { ...target, data: updatedICS },
          });
          return { success: true, data: { source: 'icloud', message: `Task "${parsed.title}" marked as completed.` } };
        }
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
      const vtodoCals = await this.getVtodoCals(client);

      for (const cal of vtodoCals) {
        const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar: cal, filters: this.vtodoFilter() });
        const target = objects.find((o) => {
          const uid = (o.data as string)
            .split('\n')
            .find((l) => l.startsWith('UID:'))
            ?.slice(4).trim();
          return uid === taskId || o.url.includes(taskId);
        });
        if (target) {
          await client.deleteCalendarObject({ calendarObject: target });
          return { success: true, data: { source: 'icloud', message: `Task deleted from Apple Reminders.` } };
        }
      }

      return { success: false, error: `Task not found: ${taskId}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
