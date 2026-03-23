/**
 * Integration tests for POST /api/chat
 *
 * Uses the real test database (postgres_test on port 5433).
 * The Anthropic LLM is mocked — no API credits are spent.
 */

import Anthropic from '@anthropic-ai/sdk';
import Fastify, { FastifyInstance } from 'fastify';
import { chatRoutes } from '@/routes/chat';
import { closePool } from '@/db/client';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

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

/**
 * Parses a raw SSE body string into an array of parsed event objects.
 * Each SSE line has the form: `data: <json>\n\n`
 */
function parseSseBody(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>);
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(chatRoutes);
  return app;
}

/**
 * Waits for background DB operations triggered after raw.end() to complete.
 *
 * With reply.hijack(), inject() resolves when raw.end() is called, but the
 * route handler keeps running (Promise.allSettled for message/memory saves).
 * This helper gives those async operations time to finish before DB assertions.
 */
async function waitForBackgroundSaves(ms = 300): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type FakeResponse = {
  stop_reason?: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
};

/** Build a fake stream object that TravelAgent can iterate over and call finalMessage() on. */
function makeStreamMock(response: FakeResponse) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: block.text },
          };
        }
      }
    },
    finalMessage: jest.fn().mockResolvedValue(response),
  };
}

/**
 * Returns mocks for both messages.create (RAG check + memory extraction)
 * and messages.stream (TravelAgent ReAct loop).
 *
 * Call order within a single POST /api/chat request:
 *   create call 1: RAGService.shouldQueryKnowledgeBase  → "no"
 *   stream call 1: TravelAgent ReAct loop               → end_turn
 *   create call 2: MemoryService.extractAndSaveMemories → empty JSON
 */
function makeMocks(agentResponse = 'Here is your Tokyo itinerary.') {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce({ content: [{ type: 'text', text: 'no' }] })
    .mockResolvedValue({ content: [{ type: 'text', text: '{}' }] });

  const mockStream = jest.fn().mockReturnValueOnce(makeStreamMock({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: agentResponse }],
  }));

  return { mockCreate, mockStream };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('POST /api/chat (integration)', () => {
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

    const { mockCreate, mockStream } = makeMocks();
    MockAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate, stream: mockStream } }) as unknown as Anthropic,
    );
  });

  // ── Response format ──────────────────────────────────────────────────────

  it('returns a text/event-stream response with text and done events', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-abc', message: 'Plan a trip to Tokyo' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSseBody(response.body);
    const textEvents = events.filter((e) => e.type === 'text');
    const doneEvents = events.filter((e) => e.type === 'done');

    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0].content).toBe('Here is your Tokyo itinerary.');
    expect(doneEvents).toHaveLength(1);
    // done must be the last event
    expect(events[events.length - 1].type).toBe('done');
  });

  // ── Database persistence ─────────────────────────────────────────────────

  it('creates a user record on the first message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-new-user', message: 'Hello' },
    });

    expect(response.statusCode).toBe(200);

    const pool = getTestPool();
    const result = await pool.query(
      "SELECT id FROM users WHERE session_id = 'session-new-user'",
    );
    expect(result.rows).toHaveLength(1);
  });

  it('saves both user and assistant messages to the database', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-msg-test', message: 'Plan a trip to Tokyo' },
    });

    expect(response.statusCode).toBe(200);

    // The route handler saves messages in Promise.allSettled after raw.end().
    // Give the event loop time to drain those async operations.
    await waitForBackgroundSaves();

    const pool = getTestPool();
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE session_id = 'session-msg-test'",
    );
    expect(userResult.rows).toHaveLength(1);
    const userId = userResult.rows[0].id;

    const convResult = await pool.query<{ id: string }>(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId],
    );
    expect(convResult.rows).toHaveLength(1);
    const conversationId = convResult.rows[0].id;

    const msgResult = await pool.query<{ role: string; content: string }>(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
    // Both messages are saved concurrently (Promise.allSettled) so their
    // created_at timestamps may be identical — avoid order-dependent assertions.
    expect(msgResult.rows).toHaveLength(2);
    expect(msgResult.rows).toContainEqual({ role: 'user', content: 'Plan a trip to Tokyo' });
    expect(msgResult.rows).toContainEqual({
      role: 'assistant',
      content: 'Here is your Tokyo itinerary.',
    });
  });

  it('continues an existing conversation when conversationId is provided', async () => {
    const pool = getTestPool();

    // First request — starts a new conversation
    const first = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-conv-test', message: 'Hi there' },
    });
    expect(first.statusCode).toBe(200);
    await waitForBackgroundSaves();

    // Extract the conversation id from the DB
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE session_id = 'session-conv-test'",
    );
    const userId = userResult.rows[0].id;
    const convResult = await pool.query<{ id: string }>(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId],
    );
    const conversationId = convResult.rows[0].id;

    // Reset mock for second request
    const { mockCreate: mockCreate2, mockStream: mockStream2 } = makeMocks('Follow-up reply.');
    MockAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate2, stream: mockStream2 } }) as unknown as Anthropic,
    );

    // Second request — continues the same conversation
    const second = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-conv-test', message: 'Follow up', conversationId },
    });
    expect(second.statusCode).toBe(200);
    await waitForBackgroundSaves();

    // Should still be one conversation with 4 messages
    const convCheck = await pool.query(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId],
    );
    expect(convCheck.rows).toHaveLength(1);

    const msgResult = await pool.query<{ role: string }>(
      'SELECT role FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );
    expect(msgResult.rows).toHaveLength(4); // user, assistant, user, assistant
  });

  // ── Memory extraction ────────────────────────────────────────────────────

  it('saves extracted memories to the database when Claude returns preferences', async () => {
    const mockCreate = jest.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'no' }] }) // RAG check
      .mockResolvedValue({
        // Memory extraction returns real preferences
        content: [{ type: 'text', text: '{"home_city":"San Francisco","diet":"vegetarian"}' }],
      });

    const mockStream = jest.fn().mockReturnValueOnce(makeStreamMock({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Great, noted your preferences!' }],
    }));

    MockAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate, stream: mockStream } }) as unknown as Anthropic,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        userId: 'session-mem-test',
        message: 'I live in San Francisco and I am vegetarian',
      },
    });
    expect(response.statusCode).toBe(200);

    // Memory extraction runs in Promise.allSettled after raw.end() — drain the event loop.
    await waitForBackgroundSaves();

    const pool = getTestPool();
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE session_id = 'session-mem-test'",
    );
    const userId = userResult.rows[0].id;

    const memResult = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM user_memories WHERE user_id = $1 ORDER BY key',
      [userId],
    );
    expect(memResult.rows).toHaveLength(2);
    expect(memResult.rows).toContainEqual({ key: 'diet', value: 'vegetarian' });
    expect(memResult.rows).toContainEqual({ key: 'home_city', value: 'San Francisco' });
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('returns 400 when userId is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-x' },
    });
    expect(response.statusCode).toBe(400);
  });
});
