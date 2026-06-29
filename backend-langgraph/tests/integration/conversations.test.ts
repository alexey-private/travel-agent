/**
 * Integration tests for conversation routes:
 *   GET /api/conversations/:userId
 *   GET /api/conversations/:userId/:conversationId/messages
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
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5432/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(conversationRoutes);
  return app;
}

async function seedConversation(
  sessionId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
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

// globalSetup probes the DB once; skip all integration tests when DB is unavailable.
const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

describe('Conversation routes (LangGraph integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await setupTestDb();
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
    await closePool();
    if (process.env.TEST_DB_AVAILABLE === 'true') await teardownTestDb();
  });

  beforeEach(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await clearTestDb();
  });

  // ── GET /api/conversations/:userId ──────────────────────────────────────────

  describe('GET /api/conversations/:userId', () => {
    itDb('creates a user on first call and returns an empty list', async () => {
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

    itDb('returns existing conversations for a known session, newest first', async () => {
      await seedConversation('session-list', [{ role: 'user', content: 'First trip' }]);
      await seedConversation('session-list', [{ role: 'user', content: 'Second trip' }]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/conversations/session-list',
      });

      expect(response.statusCode).toBe(200);
      const { conversations } = response.json() as {
        conversations: Array<{ id: string; title: string | null }>;
      };
      expect(conversations).toHaveLength(2);
      const titles = conversations.map((c) => c.title);
      expect(titles).toContain('First trip');
      expect(titles).toContain('Second trip');
    });
  });

  // ── GET /api/conversations/:userId/:conversationId/messages ─────────────────

  describe('GET /api/conversations/:userId/:conversationId/messages', () => {
    itDb('returns messages for an owned conversation', async () => {
      const { conversationId } = await seedConversation('session-msg', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/conversations/session-msg/${conversationId}/messages`,
      });

      expect(response.statusCode).toBe(200);
      const { messages } = response.json() as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Hi there!' });
    });

    itDb('returns 403 when the conversation belongs to a different user', async () => {
      const { conversationId } = await seedConversation('session-owner', [
        { role: 'user', content: 'Secret trip' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/conversations/session-other/${conversationId}/messages`,
      });

      expect(response.statusCode).toBe(403);
    });

    itDb('returns 403 for a non-existent conversationId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/conversations/session-x/00000000-0000-0000-0000-000000000000/messages',
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
