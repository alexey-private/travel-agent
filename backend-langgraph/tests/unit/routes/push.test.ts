/**
 * Unit tests for push notification routes.
 * All external dependencies (DB pool, UserService, env vars) are mocked.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { pushRoutes } from '@/routes/push';
import type { UserService } from '@/services/UserService';

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

function buildMockPool(queryResult: object = { rows: [] }) {
  return { query: jest.fn().mockResolvedValue(queryResult) };
}

function buildMockUserService(internalId = 'uuid-internal') {
  return {
    findOrCreateUser: jest.fn().mockResolvedValue(internalId),
  } as unknown as UserService;
}

async function buildApp(
  pool = buildMockPool(),
  userService = buildMockUserService(),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(pushRoutes, { pool: pool as never, userService });
  return app;
}

// ── POST /api/push/subscribe ──────────────────────────────────────────────────

describe('POST /api/push/subscribe', () => {
  it('returns 201 and inserts subscription for valid payload', async () => {
    const pool = buildMockPool();
    const app = await buildApp(pool);

    const response = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: {
        userId: 'session-abc',
        endpoint: 'https://push.example.com/sub/1',
        keys: { p256dh: 'key-abc', auth: 'auth-abc' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO push_subscriptions'),
      ['uuid-internal', 'https://push.example.com/sub/1', 'key-abc', 'auth-abc'],
    );

    await app.close();
  });

  it('returns 400 when userId is missing', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: {
        endpoint: 'https://push.example.com/sub/1',
        keys: { p256dh: 'key', auth: 'auth' },
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when endpoint is missing', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'u1', keys: { p256dh: 'k', auth: 'a' } },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when keys are missing', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'u1', endpoint: 'https://push.example.com/sub/1' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('resolves internalId via userService before inserting', async () => {
    const userService = buildMockUserService('resolved-uuid');
    const pool = buildMockPool();
    const app = await buildApp(pool, userService);

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: {
        userId: 'session-xyz',
        endpoint: 'https://push.example.com/sub/2',
        keys: { p256dh: 'k', auth: 'a' },
      },
    });

    expect(userService.findOrCreateUser).toHaveBeenCalledWith('session-xyz');
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
      'resolved-uuid',
      'https://push.example.com/sub/2',
      'k',
      'a',
    ]);

    await app.close();
  });
});

// ── DELETE /api/push/unsubscribe ──────────────────────────────────────────────

describe('DELETE /api/push/unsubscribe', () => {
  it('returns 200 and deletes subscription for valid payload', async () => {
    const pool = buildMockPool();
    const app = await buildApp(pool);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/push/unsubscribe',
      payload: {
        userId: 'session-abc',
        endpoint: 'https://push.example.com/sub/1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['uuid-internal', 'https://push.example.com/sub/1'],
    );

    await app.close();
  });

  it('returns 400 when userId is missing', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/push/unsubscribe',
      payload: { endpoint: 'https://push.example.com/sub/1' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when endpoint is missing', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/push/unsubscribe',
      payload: { userId: 'u1' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

// ── GET /api/push/vapid-public-key ───────────────────────────────────────────

describe('GET /api/push/vapid-public-key', () => {
  it('returns the public key when VAPID_PUBLIC_KEY is set', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/push/vapid-public-key',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ publicKey: 'test-vapid-public-key' });

    delete process.env.VAPID_PUBLIC_KEY;
    await app.close();
  });

  it('returns 503 when VAPID_PUBLIC_KEY is not set', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/push/vapid-public-key',
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toHaveProperty('error');

    await app.close();
  });
});
