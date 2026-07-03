/**
 * Integration tests for POST /api/chat (LangGraph backend)
 *
 * Uses the real test database (postgres_test on port 5433).
 * The LangGraph graph and LangChain models are mocked — no API credits spent.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { chatRoutes } from '@/routes/chat';
import { closePool } from '@/db/client';
import { EmbeddingService } from '@/services/EmbeddingService';
import { UserService } from '@/services/UserService';
import { ConversationService } from '@/services/ConversationService';
import { MemoryService } from '@/services/MemoryService';
import { RAGService } from '@/services/RAGService';
import { SuggestionService } from '@/services/SuggestionService';
import { UserPreferencesRepository } from '@/repositories/UserPreferencesRepository';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    TAVILY_API_KEY: 'test-tavily',
    OPENWEATHER_API_KEY: 'test-weather',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5432/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

// Use factory-local jest.fn() to avoid temporal dead zone with variable hoisting.
// Access via jest.requireMock() in tests.
jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({ invoke: jest.fn() })),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: jest.fn() })),
}));

// Graph module mocks are no longer needed — graphs are set as Fastify decorators.
// We use proxy objects so each test can replace the underlying streamEvents mock.
jest.mock('@/graph/travelGraph', () => ({}));
jest.mock('@/graph/shoppingGraph', () => ({}));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Per-test stream event mocks — replaced in beforeEach and individual tests.
let travelStreamEvents: jest.Mock;
let shoppingStreamEvents: jest.Mock;

function parseSseBody(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>);
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const pool = getTestPool();
  // Use a stub that returns a fixed vector — avoids real API calls regardless of VOYAGE_API_KEY in env
  const embeddingService = { embed: jest.fn().mockResolvedValue(Array(512).fill(0.1)) } as unknown as EmbeddingService;

  // Proxy objects: streamEvents delegates to the current test-level mock.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).decorate('travelGraph', { streamEvents: (...args: unknown[]) => travelStreamEvents(...args) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).decorate('shoppingGraph', { streamEvents: (...args: unknown[]) => shoppingStreamEvents(...args) });

  await app.register(chatRoutes, {
    userService: new UserService(pool),
    conversationService: new ConversationService(pool),
    memoryService: new MemoryService(pool),
    ragService: new RAGService(pool, embeddingService),
    suggestionService: new SuggestionService(),
    prefRepo: new UserPreferencesRepository(pool),
  });
  return app;
}

async function waitForBackgroundSaves(ms = 300): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function* makeGraphEvents(textChunks: string[]) {
  for (const chunk of textChunks) {
    yield {
      event: 'on_chat_model_stream',
      name: 'ChatAnthropic',
      data: { chunk: { content: chunk } },
    };
  }
}

async function* makeGraphEventsWithTool(
  toolName: string,
  toolInput: unknown,
  toolOutput: string,
  finalText: string,
) {
  yield { event: 'on_tool_start', name: toolName, data: { input: toolInput } };
  yield { event: 'on_tool_end', name: toolName, data: { output: toolOutput } };
  yield { event: 'on_chat_model_stream', name: 'ChatAnthropic', data: { chunk: { content: finalText } } };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

// globalSetup probes the DB once; skip all integration tests when DB is unavailable.
const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

describe('POST /api/chat (LangGraph integration)', () => {
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
    jest.clearAllMocks();

    // Default stream: single text chunk for most tests.
    travelStreamEvents = jest.fn().mockReturnValue(makeGraphEvents(['Here is your Tokyo itinerary.']));
    shoppingStreamEvents = jest.fn().mockReturnValue(makeGraphEvents(['Here is your shopping result.']));

    // Shared invoke: RAG gate → "no", memory extraction → "{}"
    const sharedInvoke = jest.fn()
      .mockResolvedValueOnce({ content: 'no' })
      .mockResolvedValue({ content: '{}' });
    const anthropicMod = jest.requireMock('@langchain/anthropic') as { ChatAnthropic: jest.Mock };
    anthropicMod.ChatAnthropic.mockImplementation(() => ({ invoke: sharedInvoke }));

    app = await buildApp();
  });

  afterEach(async () => {
    await app?.close();
  });

  // ── Response format ──────────────────────────────────────────────────────

  itDb('returns a text/event-stream response with text and done events', async () => {
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
    expect(events[events.length - 1].type).toBe('done');
  });

  itDb('emits conversation_id as first event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-conv-id', message: 'Hello' },
    });

    const events = parseSseBody(response.body);
    expect(events[0].type).toBe('conversation_id');
    expect(typeof events[0].conversationId).toBe('string');
  });

  itDb('emits tool_start and tool_end events when the graph calls tools', async () => {
    travelStreamEvents = jest.fn().mockReturnValue(
      makeGraphEventsWithTool('web_search', { query: 'Tokyo hotels' }, '{"results":[]}', 'Found some hotels.'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-tool-test', message: 'Find hotels in Tokyo' },
    });

    const events = parseSseBody(response.body);
    expect(events.some((e) => e.type === 'tool_start' && e.tool === 'web_search')).toBe(true);
    expect(events.some((e) => e.type === 'tool_end' && e.tool === 'web_search')).toBe(true);
  });

  // ── Database persistence ─────────────────────────────────────────────────

  itDb('creates a user record on the first message', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-new-user', message: 'Hello' },
    });

    const pool = getTestPool();
    const result = await pool.query(
      "SELECT id FROM users WHERE session_id = 'session-new-user'",
    );
    expect(result.rows).toHaveLength(1);
  });

  itDb('saves both user and assistant messages to the database', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-msg-test', message: 'Plan a trip to Tokyo' },
    });

    await waitForBackgroundSaves();

    const pool = getTestPool();
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE session_id = 'session-msg-test'",
    );
    const userId = userResult.rows[0].id;

    const convResult = await pool.query<{ id: string }>(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId],
    );
    const conversationId = convResult.rows[0].id;

    const msgResult = await pool.query<{ role: string; content: string }>(
      'SELECT role, content FROM messages WHERE conversation_id = $1',
      [conversationId],
    );
    expect(msgResult.rows).toHaveLength(2);
    expect(msgResult.rows).toContainEqual({ role: 'user', content: 'Plan a trip to Tokyo' });
    expect(msgResult.rows).toContainEqual({ role: 'assistant', content: 'Here is your Tokyo itinerary.' });
  });

  itDb('continues an existing conversation when conversationId is provided', async () => {
    const pool = getTestPool();

    const first = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-conv-test', message: 'Hi there' },
    });
    expect(first.statusCode).toBe(200);
    await waitForBackgroundSaves();

    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE session_id = 'session-conv-test'",
    );
    const userId = userResult.rows[0].id;
    const convResult = await pool.query<{ id: string }>(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId],
    );
    const conversationId = convResult.rows[0].id;

    // Reset mocks for second request
    travelStreamEvents = jest.fn().mockReturnValue(makeGraphEvents(['Follow-up reply.']));
    const sharedInvoke2 = jest.fn()
      .mockResolvedValueOnce({ content: 'no' })
      .mockResolvedValue({ content: '{}' });
    const anthropicMod2 = jest.requireMock('@langchain/anthropic') as { ChatAnthropic: jest.Mock };
    anthropicMod2.ChatAnthropic.mockImplementation(() => ({ invoke: sharedInvoke2 }));

    const second = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-conv-test', message: 'Follow up', conversationId },
    });
    expect(second.statusCode).toBe(200);
    await waitForBackgroundSaves();

    const convCheck = await pool.query(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId],
    );
    expect(convCheck.rows).toHaveLength(1);

    const msgResult = await pool.query<{ role: string }>(
      'SELECT role FROM messages WHERE conversation_id = $1',
      [conversationId],
    );
    expect(msgResult.rows).toHaveLength(4);
  });

  itDb('saves extracted memories when LLM returns preferences', async () => {
    await app.close();

    // RAGService and MemoryService each create their own ChatAnthropic instance.
    // Use a shared invoke mock so we can control call order across both instances.
    const sharedInvoke = jest.fn()
      .mockResolvedValueOnce({ content: 'no' }) // call 1: RAG gate → skip KB lookup
      .mockResolvedValue({ content: '{"home_city":"San Francisco","diet":"vegetarian"}' }); // call 2+: memory

    const anthropicMod = jest.requireMock('@langchain/anthropic') as { ChatAnthropic: jest.Mock };
    anthropicMod.ChatAnthropic.mockImplementation(() => ({ invoke: sharedInvoke }));

    travelStreamEvents = jest.fn().mockReturnValue(makeGraphEvents(['Great, noted your preferences!']));

    app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-mem-test', message: 'I live in San Francisco and I am vegetarian' },
    });

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

  // ── agentType ────────────────────────────────────────────────────────────

  itDb('uses the shopping graph when agentType is shopping', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-shop', message: 'Find me Nike shoes', agentType: 'shopping' },
    });

    expect(shoppingStreamEvents).toHaveBeenCalled();
    expect(travelStreamEvents).not.toHaveBeenCalled();
  });

  itDb('defaults to travel graph when agentType is not provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-travel', message: 'Plan a trip' },
    });

    expect(travelStreamEvents).toHaveBeenCalled();
    expect(shoppingStreamEvents).not.toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────────────────

  itDb('returns 400 when userId is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });
    expect(response.statusCode).toBe(400);
  });

  itDb('returns 400 when message is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-x' },
    });
    expect(response.statusCode).toBe(400);
  });

  itDb('emits error event when graph throws', async () => {
    travelStreamEvents = jest.fn().mockImplementation(async function* () {
      throw new Error('Graph execution failed');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { userId: 'session-err', message: 'Trigger error' },
    });

    const events = parseSseBody(response.body);
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });
});
