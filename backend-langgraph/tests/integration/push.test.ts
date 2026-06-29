/**
 * Integration tests for push notification routes.
 *
 * Verifies the full request → DB round-trip:
 *   POST   /api/push/subscribe      → inserts into push_subscriptions
 *   DELETE /api/push/unsubscribe    → removes from push_subscriptions
 *   POST (upsert)                   → updates p256dh/auth on duplicate endpoint
 */

import Fastify, { FastifyInstance } from 'fastify';
import { pushRoutes } from '@/routes/push';
import { UserService } from '@/services/UserService';
import { closePool } from '@/db/client';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

jest.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5432/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

async function buildApp(): Promise<FastifyInstance> {
  const pool = getTestPool();
  const app = Fastify({ logger: false });
  await app.register(pushRoutes, { pool, userService: new UserService(pool) });
  return app;
}

async function countSubscriptions(endpoint: string): Promise<number> {
  const pool = getTestPool();
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM push_subscriptions WHERE endpoint = $1',
    [endpoint],
  );
  return parseInt(result.rows[0].count, 10);
}

describe('Push notification routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await setupTestDb();
  });

  afterAll(async () => {
    await closePool();
    if (process.env.TEST_DB_AVAILABLE === 'true') await teardownTestDb();
  });

  beforeEach(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await clearTestDb();
    app = await buildApp();
  });

  afterEach(async () => {
    await app?.close();
  });

  // ── Subscribe ──────────────────────────────────────────────────────────────

  itDb('POST /api/push/subscribe creates a subscription in the DB', async () => {
    const endpoint = 'https://push.example.com/sub/integration-1';

    const response = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'session-int-1', endpoint, keys: { p256dh: 'pk1', auth: 'auth1' } },
    });

    expect(response.statusCode).toBe(201);
    expect(await countSubscriptions(endpoint)).toBe(1);
  });

  itDb('POST /api/push/subscribe auto-creates the user when they do not exist', async () => {
    const pool = getTestPool();
    const endpoint = 'https://push.example.com/sub/integration-2';

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'brand-new-session', endpoint, keys: { p256dh: 'pk', auth: 'auth' } },
    });

    const userResult = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM users WHERE session_id = 'brand-new-session'",
    );
    expect(parseInt(userResult.rows[0].count, 10)).toBe(1);
    expect(await countSubscriptions(endpoint)).toBe(1);
  });

  itDb('POST /api/push/subscribe updates keys when the endpoint already exists (upsert)', async () => {
    const endpoint = 'https://push.example.com/sub/integration-upsert';

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'session-upsert', endpoint, keys: { p256dh: 'old-key', auth: 'old-auth' } },
    });

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'session-upsert', endpoint, keys: { p256dh: 'new-key', auth: 'new-auth' } },
    });

    // Still only one row
    expect(await countSubscriptions(endpoint)).toBe(1);

    const pool = getTestPool();
    const row = await pool.query<{ p256dh: string; auth: string }>(
      'SELECT p256dh, auth FROM push_subscriptions WHERE endpoint = $1',
      [endpoint],
    );
    expect(row.rows[0].p256dh).toBe('new-key');
    expect(row.rows[0].auth).toBe('new-auth');
  });

  // ── Unsubscribe ────────────────────────────────────────────────────────────

  itDb('DELETE /api/push/unsubscribe removes the subscription from the DB', async () => {
    const endpoint = 'https://push.example.com/sub/integration-delete';

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'session-del', endpoint, keys: { p256dh: 'k', auth: 'a' } },
    });
    expect(await countSubscriptions(endpoint)).toBe(1);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/push/unsubscribe',
      payload: { userId: 'session-del', endpoint },
    });

    expect(response.statusCode).toBe(200);
    expect(await countSubscriptions(endpoint)).toBe(0);
  });

  itDb('DELETE /api/push/unsubscribe is idempotent for a non-existent endpoint', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/push/unsubscribe',
      payload: { userId: 'session-nonexistent', endpoint: 'https://push.example.com/does-not-exist' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
  });

  itDb('Deleting a user cascades to their push subscriptions', async () => {
    const endpoint = 'https://push.example.com/sub/cascade';
    const pool = getTestPool();

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { userId: 'session-cascade', endpoint, keys: { p256dh: 'k', auth: 'a' } },
    });
    expect(await countSubscriptions(endpoint)).toBe(1);

    // Delete the user directly — cascade should remove the subscription
    await pool.query("DELETE FROM users WHERE session_id = 'session-cascade'");

    expect(await countSubscriptions(endpoint)).toBe(0);
  });
});
