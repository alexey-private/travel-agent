/**
 * Integration tests for settings routes:
 *   GET    /api/settings
 *   POST   /api/settings
 *   GET    /auth/apple/status
 *   POST   /auth/apple/connect
 *   DELETE /auth/apple/disconnect
 */

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: 'postgresql://user:password@localhost:5433/travel_agent_test',
    PORT: 3001,
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!!!',
  },
}));

// Mock tsdav so /auth/apple/connect doesn't hit the real iCloud server
jest.mock('tsdav', () => ({
  DAVClient: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue(undefined),
  })),
}));

import Fastify, { FastifyInstance } from 'fastify';
import { settingsRoutes } from '@/routes/settings';
import { ICloudTokenRepository } from '@/repositories/ICloudTokenRepository';
import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';
import { GoogleTokenRepository } from '@/repositories/GoogleTokenRepository';
import { getPool, closePool } from '@/db/client';
import { setupTestDb, clearTestDb, teardownTestDb } from '../helpers/testDb';

async function buildApp(): Promise<FastifyInstance> {
  const pool = getPool();
  const app = Fastify({ logger: false });
  await app.register(settingsRoutes, {
    icloudTokenRepo: new ICloudTokenRepository(pool, 'test-encryption-key-32-chars!!!!!'),
    prefRepo: new UserPreferencesRepository(pool),
    googleTokenRepo: new GoogleTokenRepository(pool),
  });
  return app;
}

const USER_ID = 'settings-test-user';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
  await closePool();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('GET /api/settings', () => {
  it('returns default preferences for new user', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/settings?userId=${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.calendarProvider).toBe('google');
    expect(body.calendarName).toBe('Travel Agent');
    expect(body.googleConnected).toBe(false);
    expect(body.appleConnected).toBe(false);
  });

  it('returns 400 when userId missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/settings', () => {
  it('persists provider preference', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/settings?userId=${USER_ID}`,
      payload: { calendarProvider: 'apple', calendarName: 'My Calendar' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ saved: true });

    // Verify persistence
    const getRes = await app.inject({ method: 'GET', url: `/api/settings?userId=${USER_ID}` });
    const body = getRes.json() as Record<string, unknown>;
    expect(body.calendarProvider).toBe('apple');
    expect(body.calendarName).toBe('My Calendar');
  });

  it('rejects invalid provider value', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/settings?userId=${USER_ID}`,
      payload: { calendarProvider: 'outlook' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /auth/apple/status', () => {
  it('returns connected: false for new user', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/auth/apple/status?userId=${USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ connected: false });
  });
});

describe('POST /auth/apple/connect', () => {
  it('saves credentials and returns connected: true', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/auth/apple/connect?userId=${USER_ID}`,
      payload: { appleId: 'test@icloud.com', appPassword: 'xxxx-xxxx-xxxx-xxxx' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ connected: true });

    // Verify status endpoint reflects connection
    const statusRes = await app.inject({ method: 'GET', url: `/auth/apple/status?userId=${USER_ID}` });
    expect(statusRes.json()).toMatchObject({ connected: true, appleId: 'test@icloud.com' });
  });

  it('returns 400 when appleId or appPassword missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/auth/apple/connect?userId=${USER_ID}`,
      payload: { appleId: 'test@icloud.com' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /auth/apple/disconnect', () => {
  it('removes credentials and resets provider to google if on apple', async () => {
    const app = await buildApp();

    // Setup: connect Apple and set provider to apple
    await app.inject({
      method: 'POST',
      url: `/auth/apple/connect?userId=${USER_ID}`,
      payload: { appleId: 'test@icloud.com', appPassword: 'xxxx-xxxx-xxxx-xxxx' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/settings?userId=${USER_ID}`,
      payload: { calendarProvider: 'apple' },
    });

    // Disconnect
    const res = await app.inject({ method: 'DELETE', url: `/auth/apple/disconnect?userId=${USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ disconnected: true });

    // Verify provider reverted to google
    const settingsRes = await app.inject({ method: 'GET', url: `/api/settings?userId=${USER_ID}` });
    const body = settingsRes.json() as Record<string, unknown>;
    expect(body.appleConnected).toBe(false);
    expect(body.calendarProvider).toBe('google');
  });
});
