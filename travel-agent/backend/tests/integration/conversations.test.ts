/**
 * Integration tests for the conversations routes:
 *   GET /api/conversations/:userId
 *   GET /api/conversations/:userId/:conversationId/messages
 *
 * Uses the real test database (postgres_test on port 5433).
 */

import Fastify, { FastifyInstance } from 'fastify';
import { conversationRoutes } from '@/routes/conversations';
import { closePool } from '@/db/client';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

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

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(conversationRoutes);
  return app;
}

/** Inserts a user + conversation + messages directly via SQL and returns their ids. */
async function seedConversation(sessionId: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const pool = getTestPool();

  const userRow = await pool.query<{ id: string }>(
    'INSERT INTO users (session_id) VALUES ($1) ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id RETURNING id',
    [sessionId],
  );
  const userId = userRow.rows[0].id;

  const convRow = await pool.query<{ id: string }>(
    'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
    [userId],
  );
  const conversationId = convRow.rows[0].id;

  for (const msg of messages) {
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, msg.role, msg.content],
    );
  }

  return { userId, conversationId };
}

describe('Conversation routes (integration)', () => {
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
  });

  // ── GET /api/conversations/:userId ──────────────────────────────────────────

  describe('GET /api/conversations/:userId', () => {
    it('creates a user on first call and returns an empty list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/conversations/session-new',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ conversations: [] });

      const pool = getTestPool();
      const result = await pool.query("SELECT id FROM users WHERE session_id = 'session-new'");
      expect(result.rows).toHaveLength(1);
    });

    it('returns existing conversations for a known session, newest first', async () => {
      await seedConversation('session-list', [{ role: 'user', content: 'First trip' }]);
      await seedConversation('session-list', [{ role: 'user', content: 'Second trip' }]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/conversations/session-list',
      });

      expect(response.statusCode).toBe(200);
      const { conversations } = response.json() as { conversations: Array<{ id: string; title: string | null }> };
      expect(conversations).toHaveLength(2);
      // Titles come from the first user message in each conversation
      const titles = conversations.map((c) => c.title);
      expect(titles).toContain('First trip');
      expect(titles).toContain('Second trip');
    });
  });

  // ── GET /api/conversations/:userId/:conversationId/messages ─────────────────

  describe('GET /api/conversations/:userId/:conversationId/messages', () => {
    it('returns messages for an owned conversation', async () => {
      const { conversationId } = await seedConversation('session-msg', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/conversations/session-msg/${conversationId}/messages`,
      });

      expect(response.statusCode).toBe(200);
      const { messages } = response.json() as { messages: Array<{ role: string; content: string }> };
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Hi there!' });
    });

    it('returns 403 when the conversation belongs to a different user', async () => {
      const { conversationId } = await seedConversation('session-owner', [
        { role: 'user', content: 'Secret trip' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/conversations/session-other/${conversationId}/messages`,
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 403 for a non-existent conversationId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/conversations/session-x/00000000-0000-0000-0000-000000000000/messages',
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
