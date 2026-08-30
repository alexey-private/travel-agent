import { BaseRepository } from './BaseRepository';
import { encrypt, decrypt, isLegacyCiphertext } from '../utils/crypto';

interface ICloudTokenRow {
  apple_id: string;
  encrypted_password: string;
  iv: string;
  auth_tag: string;
  calendar_href: string | null;
  shopping_cal_href: string | null;
  reminder_href: string | null;
  shopping_rem_href: string | null;
}

export interface ICloudCredentials {
  appleId: string;
  appPassword: string;
  calendarHref?: string | null;
  shoppingCalHref?: string | null;
  reminderHref?: string | null;
  shoppingRemHref?: string | null;
}

export class ICloudTokenRepository extends BaseRepository {
  constructor(
    pool: ConstructorParameters<typeof BaseRepository>[0],
    private encryptionKey: string,
  ) {
    super(pool);
  }

  async save(userId: string, credentials: Pick<ICloudCredentials, 'appleId' | 'appPassword'>): Promise<void> {
    const { encrypted, iv, authTag } = encrypt(credentials.appPassword, this.encryptionKey);
    await this.execute(
      `INSERT INTO icloud_tokens (user_id, apple_id, encrypted_password, iv, auth_tag, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET apple_id           = EXCLUDED.apple_id,
             encrypted_password = EXCLUDED.encrypted_password,
             iv                 = EXCLUDED.iv,
             auth_tag           = EXCLUDED.auth_tag,
             updated_at         = NOW()`,
      [userId, credentials.appleId, encrypted, iv, authTag],
    );
  }

  async get(userId: string): Promise<ICloudCredentials | null> {
    const row = await this.queryOne<ICloudTokenRow>(
      `SELECT apple_id, encrypted_password, iv, auth_tag,
              calendar_href, shopping_cal_href, reminder_href, shopping_rem_href
       FROM icloud_tokens WHERE user_id = $1`,
      [userId],
    );
    if (!row) return null;
    const appPassword = decrypt(
      { encrypted: row.encrypted_password, iv: row.iv, authTag: row.auth_tag },
      this.encryptionKey,
    );

    // A row written before the key was derived still opens, but it is sealed
    // with the weak key. Rewriting it here is the only thing that retires that
    // key: nothing else in the system ever touches the password again, and a
    // user who never reconnects would keep the old ciphertext forever. It
    // happens once per row — the rewrite is what makes the next read a no-op.
    if (isLegacyCiphertext(row.encrypted_password)) {
      try {
        await this.save(userId, { appleId: row.apple_id, appPassword });
      } catch (err) {
        // The credentials are in hand; failing to re-seal them must not fail
        // the calendar operation that asked for them.
        console.error('[icloud] failed to re-encrypt legacy credentials:', err);
      }
    }

    return {
      appleId: row.apple_id,
      appPassword,
      calendarHref: row.calendar_href,
      shoppingCalHref: row.shopping_cal_href,
      reminderHref: row.reminder_href,
      shoppingRemHref: row.shopping_rem_href,
    };
  }

  async delete(userId: string): Promise<void> {
    await this.execute('DELETE FROM icloud_tokens WHERE user_id = $1', [userId]);
  }

  async saveCalendarHref(userId: string, href: string): Promise<void> {
    await this.execute(
      'UPDATE icloud_tokens SET calendar_href = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, href],
    );
  }

  async saveShoppingCalendarHref(userId: string, href: string): Promise<void> {
    await this.execute(
      'UPDATE icloud_tokens SET shopping_cal_href = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, href],
    );
  }

  async saveReminderHref(userId: string, href: string): Promise<void> {
    await this.execute(
      'UPDATE icloud_tokens SET reminder_href = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, href],
    );
  }

  async saveShoppingReminderHref(userId: string, href: string): Promise<void> {
    await this.execute(
      'UPDATE icloud_tokens SET shopping_rem_href = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, href],
    );
  }
}
