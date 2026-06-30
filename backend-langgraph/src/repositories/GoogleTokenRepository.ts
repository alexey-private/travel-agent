import { BaseRepository } from './BaseRepository';

interface GoogleTokenRow {
  access_token: string;
  refresh_token: string;
  expiry_date: string;
  calendar_id: string | null;
  shopping_calendar_id: string | null;
  drive_folder_id: string | null;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  calendarId?: string | null;
  shoppingCalendarId?: string | null;
  driveFolderId?: string | null;
}

export class GoogleTokenRepository extends BaseRepository {
  async save(userId: string, tokens: GoogleTokens): Promise<void> {
    await this.execute(
      `INSERT INTO google_tokens (user_id, access_token, refresh_token, expiry_date, calendar_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET access_token  = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             expiry_date   = EXCLUDED.expiry_date,
             calendar_id   = COALESCE(EXCLUDED.calendar_id, google_tokens.calendar_id),
             updated_at    = NOW()`,
      [userId, tokens.accessToken, tokens.refreshToken, tokens.expiryDate, tokens.calendarId ?? null],
    );
  }

  async get(userId: string): Promise<GoogleTokens | null> {
    const row = await this.queryOne<GoogleTokenRow>(
      'SELECT access_token, refresh_token, expiry_date, calendar_id, shopping_calendar_id, drive_folder_id FROM google_tokens WHERE user_id = $1',
      [userId],
    );
    if (!row) return null;
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiryDate: Number(row.expiry_date),
      calendarId: row.calendar_id,
      shoppingCalendarId: row.shopping_calendar_id,
      driveFolderId: row.drive_folder_id,
    };
  }

  async saveCalendarId(userId: string, calendarId: string): Promise<void> {
    await this.execute(
      'UPDATE google_tokens SET calendar_id = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, calendarId],
    );
  }

  async saveShoppingCalendarId(userId: string, calendarId: string): Promise<void> {
    await this.execute(
      'UPDATE google_tokens SET shopping_calendar_id = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, calendarId],
    );
  }

  async saveDriveFolderId(userId: string, folderId: string): Promise<void> {
    await this.execute(
      'UPDATE google_tokens SET drive_folder_id = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, folderId],
    );
  }

  async delete(userId: string): Promise<void> {
    await this.execute('DELETE FROM google_tokens WHERE user_id = $1', [userId]);
  }
}
