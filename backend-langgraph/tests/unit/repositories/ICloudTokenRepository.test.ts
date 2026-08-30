/**
 * Credentials sealed before the key was derived stay sealed with the weak key
 * unless something rewrites them. Nothing else in the system ever touches the
 * password, so the read path is where that happens.
 */

import { Pool } from 'pg';
import { ICloudTokenRepository } from '@/repositories/ICloudTokenRepository';
import { encrypt, EncryptedData } from '@/utils/crypto';
import { encryptLegacy } from '../../helpers/legacyCrypto';

const KEY = 'a-32-character-key-for-tests-012';

const legacy = (text: string) => encryptLegacy(text, KEY);

const isSelect = (sql: unknown) => String(sql).trimStart().startsWith('SELECT');

function repoReturning(stored: EncryptedData, { writeFails = false } = {}) {
  const query = jest.fn().mockImplementation((sql: string) => {
    if (isSelect(sql)) {
      return Promise.resolve({
        rows: [
          {
            apple_id: 'a@icloud.com',
            encrypted_password: stored.encrypted,
            iv: stored.iv,
            auth_tag: stored.authTag,
            calendar_href: '/cal/',
            shopping_cal_href: null,
            reminder_href: null,
            shopping_rem_href: null,
          },
        ],
      });
    }
    return writeFails ? Promise.reject(new Error('db down')) : Promise.resolve({ rows: [] });
  });
  const pool = { query } as unknown as Pool;
  return { repo: new ICloudTokenRepository(pool, KEY), query };
}

const writesOf = (query: jest.Mock) => query.mock.calls.filter(([sql]) => !isSelect(sql));

describe('get', () => {
  it('re-encrypts a row written before the key was derived', async () => {
    const { repo, query } = repoReturning(legacy('app-specific-password'));

    const creds = await repo.get('session-1');

    expect(creds?.appPassword).toBe('app-specific-password');
    expect(creds?.calendarHref).toBe('/cal/');

    const writes = writesOf(query);
    expect(writes).toHaveLength(1);
    const params = writes[0][1] as unknown[];
    expect(params[0]).toBe('session-1');
    expect(params[1]).toBe('a@icloud.com');
    expect(String(params[2]).startsWith('v2:')).toBe(true);
  });

  it('leaves an already-derived row alone', async () => {
    const { repo, query } = repoReturning(encrypt('app-specific-password', KEY));

    const creds = await repo.get('session-1');

    expect(creds?.appPassword).toBe('app-specific-password');
    expect(writesOf(query)).toHaveLength(0);
  });

  it('still returns the credentials when the rewrite fails', async () => {
    const { repo, query } = repoReturning(legacy('app-specific-password'), {
      writeFails: true,
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const creds = await repo.get('session-1');
      expect(creds?.appPassword).toBe('app-specific-password');
      expect(writesOf(query)).toHaveLength(1);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
