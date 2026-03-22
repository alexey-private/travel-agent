/**
 * Integration tests for the memory routes:
 *   GET    /api/memory/:userId
 *   DELETE /api/memory/:userId/:key
 *
 * Uses the real test database (postgres_test on port 5433).
 * The Anthropic SDK is mocked — no API credits are spent.
 */

import Anthropic from '@anthropic-ai/sdk';
import Fastify, { FastifyInstance } from 'fastify';
import { memoryRoutes } from '@/routes/memory';
import { closePool, getPool } from '@/db/client';
import { setupTestDb, clearTestDb, teardownTestDb } from '../helpers/testDb';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key',
    TAVILY_API_KEY: 'test-tavily',
    OPENWEATHER_API_KEY: 'test-weather',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: 'postgresql://user:password@localhost:5433/travel_agent_test',
    PORT: 3001,
    NODE_ENV: 'test',
  },
}));

jest.mock('@anthropic-ai/sdk');

const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(memoryRoutes);
  return app;
}

/**
 * Inserts a user with the given sessionId and returns the internal UUID.
 */
async function seedUser(sessionId: string): Promise<string> {
  const pool = getPool();
  const result = await pool.query<{ id: string }>(
    'INSERT INTO users (session_id) VALUES ($1) RETURNING id',
    [sessionId],
  );
  return result.rows[0].id;
}

/**
 * Inserts a memory entry directly into the test database.
 */
async function seedMemory(userId: string, key: string, value: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'INSERT INTO user_memories (user_id, key, value) VALUES ($1, $2, $3)',
    [userId, key, value],
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Memory routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await setupTestDb();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();

    // The memory routes instantiate Anthropic but never call it; just provide a no-op mock.
    MockAnthropic.mockImplementation(
      () => ({ messages: { create: jest.fn() } }) as unknown as Anthropic,
    );
  });

  // ── GET /api/memory/:userId ──────────────────────────────────────────────

  describe('GET /api/memory/:userId', () => {
    it('returns an empty memories array for a brand-new session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/memory/brand-new-session',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ memories: unknown[] }>();
      expect(body.memories).toEqual([]);
    });

    it('returns all stored memories for an existing user', async () => {
      const userId = await seedUser('session-with-memories');
      await seedMemory(userId, 'home_city', 'San Francisco');
      await seedMemory(userId, 'diet', 'vegetarian');

      const response = await app.inject({
        method: 'GET',
        url: '/api/memory/session-with-memories',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ memories: Array<{ key: string; value: string }> }>();
      expect(body.memories).toHaveLength(2);
      expect(body.memories).toContainEqual({ key: 'home_city', value: 'San Francisco' });
      expect(body.memories).toContainEqual({ key: 'diet', value: 'vegetarian' });
    });

    it('does not return memories belonging to a different user', async () => {
      const userId1 = await seedUser('session-user1');
      const userId2 = await seedUser('session-user2');
      await seedMemory(userId1, 'airline', 'United');
      await seedMemory(userId2, 'airline', 'Delta');

      const response = await app.inject({
        method: 'GET',
        url: '/api/memory/session-user1',
      });

      const body = response.json<{ memories: Array<{ key: string; value: string }> }>();
      expect(body.memories).toHaveLength(1);
      expect(body.memories[0]).toMatchObject({ key: 'airline', value: 'United' });
    });
  });

  // ── DELETE /api/memory/:userId/:key ─────────────────────────────────────

  describe('DELETE /api/memory/:userId/:key', () => {
    it('removes the specified memory key and returns 204', async () => {
      const userId = await seedUser('session-delete-test');
      await seedMemory(userId, 'home_city', 'New York');
      await seedMemory(userId, 'diet', 'vegan');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/memory/session-delete-test/home_city',
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify the key was deleted from the DB
      const pool = getPool();
      const result = await pool.query(
        'SELECT key FROM user_memories WHERE user_id = $1',
        [userId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].key).toBe('diet');
    });

    it('returns 204 even when the key does not exist (idempotent delete)', async () => {
      await seedUser('session-idempotent');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/memory/session-idempotent/nonexistent_key',
      });

      expect(response.statusCode).toBe(204);
    });

    it('only deletes the specified key, leaving other memories intact', async () => {
      const userId = await seedUser('session-partial-delete');
      await seedMemory(userId, 'budget', 'mid-range');
      await seedMemory(userId, 'hotel', 'boutique');
      await seedMemory(userId, 'airline', 'Delta');

      await app.inject({
        method: 'DELETE',
        url: '/api/memory/session-partial-delete/hotel',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/memory/session-partial-delete',
      });

      const body = response.json<{ memories: Array<{ key: string }> }>();
      const keys = body.memories.map((m) => m.key);
      expect(keys).not.toContain('hotel');
      expect(keys).toContain('budget');
      expect(keys).toContain('airline');
    });
  });
});
