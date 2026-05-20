import { google } from 'googleapis';
import { ToolResult } from '../../types/tools';
import { CalendarProvider, CalendarAddParams, CalendarListParams, CalendarDeleteParams } from './CalendarProvider';
import { GoogleTokenRepository } from '../../repositories/GoogleTokenRepository';

const TRAVEL_CALENDAR_NAME = 'Travel Agent';
const SHOPPING_CALENDAR_NAME = 'Shopping';

const CATEGORY_COLORS: Record<string, string> = {
  travel: '11',   // Tomato
  shopping: '5',  // Banana
  reminder: '7',  // Peacock
  other: '1',     // Lavender
};

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private tokenRepo: GoogleTokenRepository,
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string,
  ) {}

  private async getClient(userId: string) {
    const tokens = await this.tokenRepo.get(userId);
    if (!tokens) throw new Error('Google Calendar not connected. Please connect your Google account first.');

    const auth = new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });

    auth.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await this.tokenRepo.save(userId, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token ?? tokens.refreshToken,
          expiryDate: newTokens.expiry_date ?? tokens.expiryDate,
        });
      }
    });

    return { calendar: google.calendar({ version: 'v3', auth }), tokens };
  }

  private async getOrCreateCalendarId(userId: string): Promise<string> {
    const { calendar, tokens } = await this.getClient(userId);

    if (tokens.calendarId) return tokens.calendarId;

    const list = await calendar.calendarList.list();
    const existing = list.data.items?.find(c => c.summary === TRAVEL_CALENDAR_NAME);
    if (existing?.id) {
      await this.tokenRepo.saveCalendarId(userId, existing.id);
      return existing.id;
    }

    const created = await calendar.calendars.insert({
      requestBody: { summary: TRAVEL_CALENDAR_NAME, timeZone: 'UTC' },
    });
    const calendarId = created.data.id!;
    await this.tokenRepo.saveCalendarId(userId, calendarId);
    return calendarId;
  }

  private async getOrCreateShoppingCalendarId(userId: string): Promise<string> {
    const { calendar, tokens } = await this.getClient(userId);

    if (tokens.shoppingCalendarId) return tokens.shoppingCalendarId;

    const list = await calendar.calendarList.list();
    const existing = list.data.items?.find(c => c.summary === SHOPPING_CALENDAR_NAME);
    if (existing?.id) {
      await this.tokenRepo.saveShoppingCalendarId(userId, existing.id);
      return existing.id;
    }

    const created = await calendar.calendars.insert({
      requestBody: { summary: SHOPPING_CALENDAR_NAME, timeZone: 'UTC' },
    });
    const calendarId = created.data.id!;
    await this.tokenRepo.saveShoppingCalendarId(userId, calendarId);
    return calendarId;
  }

  async add(params: CalendarAddParams): Promise<ToolResult> {
    const { userId, title, date, time, description, category } = params;

    const { calendar } = await this.getClient(userId);
    const isShopping = category === 'shopping';
    const calendarId = isShopping
      ? await this.getOrCreateShoppingCalendarId(userId)
      : await this.getOrCreateCalendarId(userId);
    const calendarName = isShopping ? SHOPPING_CALENDAR_NAME : TRAVEL_CALENDAR_NAME;

    const start = time
      ? { dateTime: `${date}T${time}:00`, timeZone: 'UTC' }
      : { date };
    const end = time
      ? { dateTime: `${date}T${padTime(time, 1)}:00`, timeZone: 'UTC' }
      : { date };

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: description ?? '',
        start,
        end,
        colorId: CATEGORY_COLORS[category] ?? '1',
      },
    });

    return {
      success: true,
      data: {
        message: `Event "${title}" added to "${calendarName}" calendar for ${date}${time ? ` at ${time}` : ''}.`,
        event: {
          id: event.data.id,
          title,
          date,
          time: time ?? 'All day',
          description: description ?? '',
          category,
          htmlLink: event.data.htmlLink,
        },
        source: 'google',
      },
    };
  }

  async list(params: CalendarListParams): Promise<ToolResult> {
    const { calendar } = await this.getClient(params.userId);

    const now = new Date().toISOString();

    // Fetch from both calendars in parallel
    const [travelId, shoppingId] = await Promise.all([
      this.getOrCreateCalendarId(params.userId),
      this.getOrCreateShoppingCalendarId(params.userId),
    ]);

    const [travelRes, shoppingRes] = await Promise.all([
      calendar.events.list({
        calendarId: travelId,
        timeMin: now,
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      }),
      calendar.events.list({
        calendarId: shoppingId,
        timeMin: now,
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      }),
    ]);

    const mapEvents = (items: typeof travelRes.data.items, calendarName: string) =>
      (items ?? []).map(e => ({
        id: e.id,
        title: e.summary ?? '(no title)',
        date: e.start?.date ?? e.start?.dateTime?.split('T')[0] ?? '',
        time: e.start?.dateTime ? e.start.dateTime.split('T')[1]?.slice(0, 5) : 'All day',
        description: e.description ?? '',
        htmlLink: e.htmlLink,
        calendar: calendarName,
      }));

    const events = [
      ...mapEvents(travelRes.data.items, TRAVEL_CALENDAR_NAME),
      ...mapEvents(shoppingRes.data.items, SHOPPING_CALENDAR_NAME),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      data: { upcoming: events, total: events.length, source: 'google' },
    };
  }

  async delete(params: CalendarDeleteParams): Promise<ToolResult> {
    const { calendar } = await this.getClient(params.userId);

    // Try travel calendar first, then shopping
    const [travelId, shoppingId] = await Promise.all([
      this.getOrCreateCalendarId(params.userId),
      this.getOrCreateShoppingCalendarId(params.userId),
    ]);

    try {
      await calendar.events.delete({ calendarId: travelId, eventId: params.eventId });
      return {
        success: true,
        data: { message: `Event ${params.eventId} deleted from "${TRAVEL_CALENDAR_NAME}" calendar.`, source: 'google' },
      };
    } catch {
      await calendar.events.delete({ calendarId: shoppingId, eventId: params.eventId });
      return {
        success: true,
        data: { message: `Event ${params.eventId} deleted from "${SHOPPING_CALENDAR_NAME}" calendar.`, source: 'google' },
      };
    }
  }
}

function padTime(time: string, addHours: number): string {
  const [h, m] = time.split(':').map(Number);
  const newH = Math.min(h + addHours, 23);
  return `${newH.toString().padStart(2, '0')}:${(m ?? 0).toString().padStart(2, '0')}`;
}
