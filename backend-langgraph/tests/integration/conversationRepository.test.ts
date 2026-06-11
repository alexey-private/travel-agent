/**
 * Integration tests for lm_messages round-trip through ConversationRepository.
 *
 * Verifies that:
 *   - LMRound data is serialised to JSONB and deserialised back correctly.
 *   - getHistory returns lm_messages for assistant rows.
 *   - historyToMessages expands lm_messages into AIMessage+ToolMessage sequences.
 *   - Backward-compat: old rows with lm_messages = NULL still produce an AIMessage.
 */

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Pool } from 'pg';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { historyToMessages } from '@/graph/history';
import { setupTestDb, clearTestDb, teardownTestDb, getTestPool } from '../helpers/testDb';

jest.mock('@/config/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/travel_agent',
    TEST_DATABASE_URL: 'postgresql://user:password@localhost:5433/travel_agent_test',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

const itDb = process.env.TEST_DB_AVAILABLE === 'true' ? it : it.skip;

async function seedUser(pool: Pool, sessionId: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    'INSERT INTO users (session_id) VALUES ($1) ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id RETURNING id',
    [sessionId],
  );
  return r.rows[0].id;
}

async function seedConversation(pool: Pool, userId: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
    [userId],
  );
  return r.rows[0].id;
}

describe('ConversationRepository — lm_messages round-trip (integration)', () => {
  let pool: Pool;
  let repo: ConversationRepository;

  beforeAll(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await setupTestDb();
    pool = getTestPool();
    repo = new ConversationRepository(pool);
  });

  afterAll(async () => {
    if (process.env.TEST_DB_AVAILABLE === 'true') await teardownTestDb();
  });

  beforeEach(async () => {
    if (process.env.TEST_DB_AVAILABLE !== 'true') return;
    await clearTestDb();
  });

  // ── saveMessage + getHistory ──────────────────────────────────────────────

  itDb('stores and retrieves lm_messages JSONB correctly', async () => {
    const userId = await seedUser(pool, 'session-lm-1');
    const convId = await seedConversation(pool, userId);

    const rounds = [
      {
        tool_calls: [{ id: 'c1', name: 'search_flights', args: { from: 'NYC', to: 'LON' } }],
        tool_results: [{ tool_call_id: 'c1', name: 'search_flights', content: '{"flights":[]}' }],
      },
    ];

    await repo.saveMessage(convId, 'user', 'Find flights to London');
    await repo.saveMessage(convId, 'assistant', 'Here are the flights.', undefined, rounds);

    const history = await repo.getHistory(convId);

    expect(history).toHaveLength(2);
    expect(history[0].lm_messages).toBeNull();           // user messages have no lm_messages
    expect(history[1].lm_messages).toEqual(rounds);       // round-trips cleanly
  });

  itDb('stores lm_messages as NULL when no tool calls occurred', async () => {
    const userId = await seedUser(pool, 'session-lm-2');
    const convId = await seedConversation(pool, userId);

    await repo.saveMessage(convId, 'assistant', 'Hello!');

    const history = await repo.getHistory(convId);

    expect(history[0].lm_messages).toBeNull();
  });

  itDb('stores lm_messages as NULL for an empty rounds array', async () => {
    const userId = await seedUser(pool, 'session-lm-3');
    const convId = await seedConversation(pool, userId);

    await repo.saveMessage(convId, 'assistant', 'Hello!', undefined, []);

    const history = await repo.getHistory(convId);

    expect(history[0].lm_messages).toBeNull();
  });

  // ── historyToMessages with real DB data ──────────────────────────────────

  itDb('historyToMessages expands lm_messages into AIMessage+ToolMessage+AIMessage', async () => {
    const userId = await seedUser(pool, 'session-lm-4');
    const convId = await seedConversation(pool, userId);

    await repo.saveMessage(convId, 'user', 'Find flights');
    await repo.saveMessage(convId, 'assistant', 'Here are the results.', undefined, [
      {
        tool_calls: [{ id: 'tc1', name: 'search_flights', args: { from: 'JFK', to: 'CDG' } }],
        tool_results: [{ tool_call_id: 'tc1', name: 'search_flights', content: '{"flights":[{"price":500}]}' }],
      },
    ]);

    const history = await repo.getHistory(convId);
    const msgs = historyToMessages(history);

    // HumanMessage + AIMessage(tool_calls) + ToolMessage + AIMessage(final text)
    expect(msgs).toHaveLength(4);
    expect(msgs[0]).toBeInstanceOf(HumanMessage);
    expect(msgs[0].content).toBe('Find flights');

    expect(msgs[1]).toBeInstanceOf(AIMessage);
    const toolCallMsg = msgs[1] as AIMessage;
    expect(toolCallMsg.tool_calls).toEqual([
      { id: 'tc1', name: 'search_flights', args: { from: 'JFK', to: 'CDG' }, type: 'tool_call' },
    ]);

    expect(msgs[2]).toBeInstanceOf(ToolMessage);
    const toolResultMsg = msgs[2] as ToolMessage;
    expect(toolResultMsg.tool_call_id).toBe('tc1');
    expect(toolResultMsg.content).toBe('{"flights":[{"price":500}]}');

    expect(msgs[3]).toBeInstanceOf(AIMessage);
    expect(msgs[3].content).toBe('Here are the results.');
  });

  itDb('historyToMessages is backward-compatible with NULL lm_messages', async () => {
    const userId = await seedUser(pool, 'session-lm-5');
    const convId = await seedConversation(pool, userId);

    // Insert old-style row (no lm_messages column value)
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convId, 'assistant', 'Old assistant response'],
    );

    const history = await repo.getHistory(convId);
    const msgs = historyToMessages(history);

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBeInstanceOf(AIMessage);
    expect(msgs[0].content).toBe('Old assistant response');
  });

  itDb('multi-round ReAct: two tool call rounds followed by a final text response', async () => {
    const userId = await seedUser(pool, 'session-lm-6');
    const convId = await seedConversation(pool, userId);

    await repo.saveMessage(convId, 'assistant', 'Done.', undefined, [
      {
        tool_calls: [{ id: 'r1', name: 'search_flights', args: {} }],
        tool_results: [{ tool_call_id: 'r1', name: 'search_flights', content: '{}' }],
      },
      {
        tool_calls: [{ id: 'r2', name: 'get_weather', args: {} }],
        tool_results: [{ tool_call_id: 'r2', name: 'get_weather', content: '{"temp":20}' }],
      },
    ]);

    const history = await repo.getHistory(convId);
    const msgs = historyToMessages(history);

    // AIMessage(r1) + ToolMessage(r1) + AIMessage(r2) + ToolMessage(r2) + AIMessage('Done.')
    expect(msgs).toHaveLength(5);
    expect(msgs[0]).toBeInstanceOf(AIMessage);
    expect((msgs[0] as AIMessage).tool_calls?.[0].id).toBe('r1');
    expect(msgs[1]).toBeInstanceOf(ToolMessage);
    expect(msgs[2]).toBeInstanceOf(AIMessage);
    expect((msgs[2] as AIMessage).tool_calls?.[0].id).toBe('r2');
    expect(msgs[3]).toBeInstanceOf(ToolMessage);
    expect(msgs[4]).toBeInstanceOf(AIMessage);
    expect(msgs[4].content).toBe('Done.');
  });
});
