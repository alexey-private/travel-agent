/**
 * Integration tests for GET /api/users/telegram.
 *
 * Verifies that the route correctly filters users by session_id prefix:
 *   - returns only "tg-<numericId>" rows
 *   - excludes "tg-anon-..." (anonymous) rows
 *   - excludes plain web session rows
 */

import Fastify, { FastifyInstance } from 'fastify';
import { userRoutes } from '@/routes/users';
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
  const app = Fastify({ logger: false });
  await app.register(userRoutes);
  return app;
}

async function seedUser(sessionId: string): Promise<void> {
  const pool = getTestPool();
  await pool.query(
    'INSERT INTO users (session_id) VALUES ($1) ON CONFLICT (session_id) DO NOTHING',
    [sessionId],
  );
}

describe('GET /api/users/telegram (integration)', () => {
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

  itDb('returns session IDs for real telegram users', async () => {
    await seedUser('tg-123456');
    await seedUser('tg-789012');

    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { sessionIds: string[] };
    expect(body.sessionIds).toHaveLength(2);
    expect(body.sessionIds).toContain('tg-123456');
    expect(body.sessionIds).toContain('tg-789012');
  });

  itDb('excludes anonymous telegram sessions (tg-anon-...)', async () => {
    await seedUser('tg-123456');
    await seedUser('tg-anon-550e8400-e29b-41d4-a716-446655440000');

    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    const body = JSON.parse(response.body) as { sessionIds: string[] };
    expect(body.sessionIds).toHaveLength(1);
    expect(body.sessionIds[0]).toBe('tg-123456');
  });

  itDb('excludes web browser session IDs', async () => {
    await seedUser('tg-111222');
    await seedUser('web-browser-session-abc');
    await seedUser('some-other-uuid-session');

    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    const body = JSON.parse(response.body) as { sessionIds: string[] };
    expect(body.sessionIds).toHaveLength(1);
    expect(body.sessionIds[0]).toBe('tg-111222');
  });

  itDb('returns empty array when there are no telegram users', async () => {
    await seedUser('web-session-only');

    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    const body = JSON.parse(response.body) as { sessionIds: string[] };
    expect(body.sessionIds).toHaveLength(0);
  });

  itDb('returns empty array when the users table is empty', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/users/telegram' });

    const body = JSON.parse(response.body) as { sessionIds: string[] };
    expect(body.sessionIds).toHaveLength(0);
  });
});
