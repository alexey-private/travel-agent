import { google } from 'googleapis';
import { ToolResult } from '../../types/tools';
import { CalendarProvider, CalendarAddParams, CalendarListParams, CalendarDeleteParams } from './CalendarProvider';
import { GoogleTokenRepository } from '../../repositories/GoogleTokenRepository';

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

    // Auto-refresh and persist new access token if expired
    auth.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await this.tokenRepo.save(userId, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token ?? tokens.refreshToken,
          expiryDate: newTokens.expiry_date ?? tokens.expiryDate,
        });
      }
    });

    return google.calendar({ version: 'v3', auth });
  }

  async add(params: CalendarAddParams): Promise<ToolResult> {
    const { userId, title, date, time, description, category } = params;

    const calendar = await this.getClient(userId);

    const start = time
      ? { dateTime: `${date}T${time}:00`, timeZone: 'UTC' }
      : { date };
    const end = time
      ? { dateTime: `${date}T${padTime(time, 1)}:00`, timeZone: 'UTC' }
      : { date };

    const event = await calendar.events.insert({
      calendarId: 'primary',
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
        message: `Event "${title}" added to Google Calendar for ${date}${time ? ` at ${time}` : ''}.`,
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
    const calendar = await this.getClient(params.userId);

    const now = new Date().toISOString();
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now,
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (res.data.items ?? []).map(e => ({
      id: e.id,
      title: e.summary ?? '(no title)',
      date: e.start?.date ?? e.start?.dateTime?.split('T')[0] ?? '',
      time: e.start?.dateTime ? e.start.dateTime.split('T')[1]?.slice(0, 5) : 'All day',
      description: e.description ?? '',
      htmlLink: e.htmlLink,
    }));

    return {
      success: true,
      data: { upcoming: events, total: events.length, source: 'google' },
    };
  }

  async delete(params: CalendarDeleteParams): Promise<ToolResult> {
    const calendar = await this.getClient(params.userId);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: params.eventId,
    });

    return {
      success: true,
      data: { message: `Event ${params.eventId} deleted from Google Calendar.`, source: 'google' },
    };
  }
}

function padTime(time: string, addHours: number): string {
  const [h, m] = time.split(':').map(Number);
  const newH = Math.min(h + addHours, 23);
  return `${newH.toString().padStart(2, '0')}:${(m ?? 0).toString().padStart(2, '0')}`;
}
