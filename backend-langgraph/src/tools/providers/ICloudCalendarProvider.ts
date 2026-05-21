import { DAVClient, DAVCalendar } from 'tsdav';
import { randomUUID } from 'crypto';
import { ICloudTokenRepository } from '../../repositories/ICloudTokenRepository';
import { UserPreferencesRepository } from '../../repositories/UserPreferencesRepository';
import {
  CalendarProvider,
  CalendarAddParams,
  CalendarListParams,
  CalendarDeleteParams,
  CalendarUpdateParams,
} from './CalendarProvider';
import { ToolResult } from '../../types/tools';

interface ParsedEvent {
  id: string;
  href: string;
  title: string;
  date: string;
  endDate?: string;
  time?: string;
  description?: string;
  category: string;
}

export class ICloudCalendarProvider implements CalendarProvider {
  constructor(
    private tokenRepo: ICloudTokenRepository,
    private prefRepo: UserPreferencesRepository,
  ) {}

  private async getClient(userId: string): Promise<DAVClient> {
    const creds = await this.tokenRepo.get(userId);
    if (!creds)
      throw new Error(
        'Apple iCloud not connected. Please connect your Apple account in Settings.',
      );
    const client = new DAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: creds.appleId, password: creds.appPassword },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    await client.login();
    return client;
  }

  private async getOrCreateCalendarHref(
    client: DAVClient,
    userId: string,
    name: string,
    isShoppingCalendar: boolean,
  ): Promise<string> {
    const creds = await this.tokenRepo.get(userId);
    const cachedHref = isShoppingCalendar
      ? creds?.shoppingCalHref
      : creds?.calendarHref;
    if (cachedHref) return cachedHref;

    const calendars: DAVCalendar[] = await client.fetchCalendars();
    const veventCals = calendars.filter((c) => {
      const components = (c.components ?? []) as string[];
      return components.includes('VEVENT');
    });

    const existing = veventCals.find(
      (c) => String(c.displayName ?? '').toLowerCase() === name.toLowerCase(),
    );

    let href: string;
    if (existing) {
      href = existing.url;
    } else {
      const newUrl = `${client.account?.homeUrl ?? ''}${randomUUID()}/`;
      await client.makeCalendar({
        url: newUrl,
        props: {
          'd:displayname': name,
          'c:supported-calendar-component-set': {
            'c:comp': { _attributes: { name: 'VEVENT' } },
          },
        },
      });
      href = newUrl;
    }

    if (isShoppingCalendar) {
      await this.tokenRepo.saveShoppingCalendarHref(userId, href);
    } else {
      await this.tokenRepo.saveCalendarHref(userId, href);
    }
    return href;
  }

  private parseICS(icsString: string, href: string): ParsedEvent | null {
    const lines = icsString.replace(/\r\n/g, '\n').split('\n');
    const uid =
      lines
        .find((l) => l.startsWith('UID:'))
        ?.slice(4)
        .trim() ?? href;
    const summary =
      lines
        .find((l) => l.startsWith('SUMMARY:'))
        ?.slice(8)
        .trim() ?? '';
    const dtstart =
      lines
        .find((l) => l.startsWith('DTSTART'))
        ?.replace(/^DTSTART[^:]*:/, '')
        .trim() ?? '';
    const dtendRaw =
      lines
        .find((l) => l.startsWith('DTEND'))
        ?.replace(/^DTEND[^:]*:/, '')
        .trim() ?? '';
    const description = lines
      .find((l) => l.startsWith('DESCRIPTION:'))
      ?.slice(12)
      .trim();
    const categories =
      lines
        .find((l) => l.startsWith('CATEGORIES:'))
        ?.slice(11)
        .trim()
        ?.toLowerCase() ?? 'other';

    if (!dtstart) return null;
    const date =
      dtstart.length >= 8
        ? `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`
        : dtstart;
    const time = dtstart.includes('T')
      ? `${dtstart.slice(9, 11)}:${dtstart.slice(11, 13)}`
      : undefined;

    let endDate: string | undefined;
    if (dtendRaw.length >= 8) {
      const rawDate = `${dtendRaw.slice(0, 4)}-${dtendRaw.slice(4, 6)}-${dtendRaw.slice(6, 8)}`;
      if (!dtendRaw.includes('T')) {
        // DATE-type DTEND is exclusive in iCal — subtract 1 day for display
        const d = new Date(rawDate);
        d.setUTCDate(d.getUTCDate() - 1);
        endDate = d.toISOString().slice(0, 10);
      } else {
        endDate = rawDate;
      }
      if (endDate === date) endDate = undefined;
    }

    return {
      id: uid,
      href,
      title: summary,
      date,
      endDate,
      time,
      description,
      category: categories,
    };
  }

  async add(params: CalendarAddParams): Promise<ToolResult> {
    const { userId, title, date, endDate, time, description, category } = params;
    try {
      const client = await this.getClient(userId);
      const prefs = await this.prefRepo.get(userId);
      const isShoppingCategory = category === 'shopping';
      const calName = isShoppingCategory
        ? prefs.shoppingCalendarName
        : prefs.calendarName;
      const calHref = await this.getOrCreateCalendarHref(
        client,
        userId,
        calName,
        isShoppingCategory,
      );

      const uid = randomUUID();
      let dtstart: string;
      let dtend: string;
      if (time) {
        const dt = `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
        dtstart = `DTSTART:${dt}`;
        dtend = `DTEND:${dt}`;
      } else {
        dtstart = `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`;
        if (endDate) {
          dtend = `DTEND;VALUE=DATE:${endDate.replace(/-/g, '')}`;
        } else {
          const next = new Date(date);
          next.setDate(next.getDate() + 1);
          dtend = `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`;
        }
      }

      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TravelAgent//EN',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `SUMMARY:${title}`,
        dtstart,
        dtend,
        description ? `DESCRIPTION:${description}` : '',
        `CATEGORIES:${category}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ]
        .filter(Boolean)
        .join('\r\n');

      await client.createCalendarObject({
        calendar: { url: calHref } as DAVCalendar,
        filename: `${uid}.ics`,
        iCalString: icsData,
      });

      return {
        success: true,
        data: {
          eventId: uid,
          title,
          date,
          time,
          calendar: calName,
          source: 'icloud',
          viewUrl: 'https://www.icloud.com/calendar/',
          message: `Event "${title}" added to Apple Calendar (${calName}).`,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async list(params: CalendarListParams): Promise<ToolResult> {
    const { userId } = params;
    try {
      const client = await this.getClient(userId);
      const calendars: DAVCalendar[] = await client.fetchCalendars();
      const veventCals = calendars.filter((c) =>
        c.components?.includes('VEVENT'),
      );

      const today = new Date().toISOString().slice(0, 10);
      const events: ParsedEvent[] = [];

      for (const cal of veventCals) {
        const objects = await client.fetchCalendarObjects({ calendar: cal });
        for (const obj of objects) {
          const parsed = this.parseICS(obj.data as string, obj.url);
          if (parsed && parsed.date >= today) events.push(parsed);
        }
      }

      events.sort((a, b) => a.date.localeCompare(b.date));

      return {
        success: true,
        data: {
          source: 'icloud',
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            date: e.date,
            endDate: e.endDate,
            time: e.time,
            description: e.description,
            category: e.category,
          })),
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async delete(params: CalendarDeleteParams): Promise<ToolResult> {
    const { userId, eventId } = params;
    try {
      const client = await this.getClient(userId);
      const calendars: DAVCalendar[] = await client.fetchCalendars();
      const veventCals = calendars.filter((c) =>
        c.components?.includes('VEVENT'),
      );

      for (const cal of veventCals) {
        const objects = await client.fetchCalendarObjects({ calendar: cal });
        const target = objects.find((o) => {
          const uid = (o.data as string)
            .split('\n')
            .find((l) => l.startsWith('UID:'))
            ?.slice(4)
            .trim();
          return uid === eventId || o.url.includes(eventId);
        });
        if (target) {
          await client.deleteCalendarObject({ calendarObject: target });
          return {
            success: true,
            data: {
              source: 'icloud',
              message: `Event deleted from Apple Calendar.`,
            },
          };
        }
      }

      return { success: false, error: `Event not found: ${eventId}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async update(params: CalendarUpdateParams): Promise<ToolResult> {
    const { userId, eventId, title, date, endDate, time, description, category } = params;
    try {
      const client = await this.getClient(userId);
      const calendars: DAVCalendar[] = await client.fetchCalendars();
      const veventCals = calendars.filter((c) => c.components?.includes('VEVENT'));

      for (const cal of veventCals) {
        const objects = await client.fetchCalendarObjects({ calendar: cal });
        const target = objects.find((o) => {
          const uid = (o.data as string).split('\n').find((l) => l.startsWith('UID:'))?.slice(4).trim();
          return uid === eventId || o.url.includes(eventId);
        });
        if (!target) continue;

        const existing = this.parseICS(target.data as string, target.url);
        if (!existing) continue;

        const mergedTitle = title ?? existing.title;
        const mergedDate = date ?? existing.date;
        const mergedTime = time !== undefined ? time : existing.time;
        const mergedDesc = description !== undefined ? description : existing.description;
        const mergedCat = category ?? existing.category;
        const mergedEndDate = endDate ?? existing.endDate ?? mergedDate;

        let dtstart: string;
        let dtend: string;
        if (mergedTime) {
          const dt = `${mergedDate.replace(/-/g, '')}T${mergedTime.replace(':', '')}00`;
          dtstart = `DTSTART:${dt}`;
          dtend = `DTEND:${dt}`;
        } else {
          dtstart = `DTSTART;VALUE=DATE:${mergedDate.replace(/-/g, '')}`;
          const nextDay = new Date(mergedEndDate);
          nextDay.setDate(nextDay.getDate() + 1);
          dtend = `DTEND;VALUE=DATE:${nextDay.toISOString().slice(0, 10).replace(/-/g, '')}`;
        }

        const newICS = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//TravelAgent//EN',
          'BEGIN:VEVENT',
          `UID:${existing.id}`,
          `SUMMARY:${mergedTitle}`,
          dtstart,
          dtend,
          mergedDesc ? `DESCRIPTION:${mergedDesc}` : '',
          `CATEGORIES:${mergedCat}`,
          'END:VEVENT',
          'END:VCALENDAR',
        ].filter(Boolean).join('\r\n');

        await client.updateCalendarObject({ calendarObject: { ...target, data: newICS } });

        return {
          success: true,
          data: {
            source: 'icloud',
            eventId: existing.id,
            title: mergedTitle,
            date: mergedDate,
            time: mergedTime,
            message: `Event "${mergedTitle}" updated in Apple Calendar.`,
          },
        };
      }

      return { success: false, error: `Event not found: ${eventId}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
