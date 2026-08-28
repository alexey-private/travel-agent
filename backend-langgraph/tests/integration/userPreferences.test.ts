/**
 * Integration tests for the `language` column on user_service_preferences.
 *
 * The column feeds three consumers that never talk to each other — the web UI,
 * the Telegram bridge and the web-push cron — so its default and its CHECK
 * constraint are the only thing keeping them in agreement.
 */

import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5432/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

describe('UserPreferencesRepository — language (integration)', () => {
  let repo: UserPreferencesRepository;

  beforeAll(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await setupTestDb();
    repo = new UserPreferencesRepository(getTestPool());
  });

  beforeEach(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await clearTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  itDb('defaults to English for a user with no saved preferences', async () => {
    const prefs = await repo.get('session-no-prefs');
    expect(prefs.language).toBe('en');
  });

  itDb('defaults to English for a row saved without a language', async () => {
    await repo.save('session-partial', { calendarProvider: 'apple' });
    const prefs = await repo.get('session-partial');
    expect(prefs.language).toBe('en');
    expect(prefs.calendarProvider).toBe('apple');
  });

  itDb('persists Hebrew and reads it back', async () => {
    await repo.save('session-he', { language: 'he' });
    const prefs = await repo.get('session-he');
    expect(prefs.language).toBe('he');
  });

  itDb('updates the language without clobbering other preferences', async () => {
    await repo.save('session-mix', { calendarName: 'My Trips', language: 'ru' });
    await repo.save('session-mix', { language: 'he' });
    const prefs = await repo.get('session-mix');
    expect(prefs.language).toBe('he');
    expect(prefs.calendarName).toBe('My Trips');
  });

  itDb('leaves the language alone when save() omits it', async () => {
    await repo.save('session-keep', { language: 'ru' });
    await repo.save('session-keep', { calendarName: 'Renamed' });
    const prefs = await repo.get('session-keep');
    expect(prefs.language).toBe('ru');
  });

  itDb('rejects an unsupported language at the database level', async () => {
    await expect(
      getTestPool().query(`INSERT INTO user_service_preferences (user_id, language) VALUES ($1, $2)`, [
        'session-bad',
        'de',
      ]),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });
});
