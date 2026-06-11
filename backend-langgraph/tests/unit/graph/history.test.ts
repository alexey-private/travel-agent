import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { lmRoundsToMessages, historyToMessages } from '@/graph/history';
import type { LMRound } from '@/types/lm';

// ── lmRoundsToMessages ────────────────────────────────────────────────────────

describe('lmRoundsToMessages', () => {
  it('returns empty array for empty rounds', () => {
    expect(lmRoundsToMessages([])).toEqual([]);
  });

  it('skips rounds with no tool_calls', () => {
    const rounds: LMRound[] = [{ tool_calls: [], tool_results: [] }];
    expect(lmRoundsToMessages(rounds)).toEqual([]);
  });

  it('skips rounds where any tool_call has an empty id', () => {
    const rounds: LMRound[] = [{
      tool_calls: [{ id: '', name: 'search_flights', args: {} }],
      tool_results: [],
    }];
    expect(lmRoundsToMessages(rounds)).toEqual([]);
  });

  it('produces AIMessage + ToolMessages for a single round', () => {
    const rounds: LMRound[] = [{
      tool_calls: [{ id: 'call_1', name: 'get_weather', args: { city: 'Tokyo' } }],
      tool_results: [{ tool_call_id: 'call_1', name: 'get_weather', content: '{"temp":22}' }],
    }];

    const msgs = lmRoundsToMessages(rounds);

    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBeInstanceOf(AIMessage);
    expect((msgs[0] as AIMessage).tool_calls).toEqual([
      { id: 'call_1', name: 'get_weather', args: { city: 'Tokyo' }, type: 'tool_call' },
    ]);
    expect(msgs[1]).toBeInstanceOf(ToolMessage);
    expect((msgs[1] as ToolMessage).content).toBe('{"temp":22}');
    expect((msgs[1] as ToolMessage).tool_call_id).toBe('call_1');
  });

  it('produces multiple ToolMessages for parallel tool calls in one round', () => {
    const rounds: LMRound[] = [{
      tool_calls: [
        { id: 'call_a', name: 'search_flights', args: {} },
        { id: 'call_b', name: 'get_weather', args: {} },
      ],
      tool_results: [
        { tool_call_id: 'call_a', name: 'search_flights', content: '{"flights":[]}' },
        { tool_call_id: 'call_b', name: 'get_weather', content: '{"temp":15}' },
      ],
    }];

    const msgs = lmRoundsToMessages(rounds);

    expect(msgs).toHaveLength(3); // 1 AIMessage + 2 ToolMessages
    expect(msgs[0]).toBeInstanceOf(AIMessage);
    expect((msgs[0] as AIMessage).tool_calls).toHaveLength(2);
    expect(msgs[1]).toBeInstanceOf(ToolMessage);
    expect((msgs[1] as ToolMessage).tool_call_id).toBe('call_a');
    expect(msgs[2]).toBeInstanceOf(ToolMessage);
    expect((msgs[2] as ToolMessage).tool_call_id).toBe('call_b');
  });

  it('produces consecutive AIMessage+ToolMessage blocks for multiple rounds', () => {
    const rounds: LMRound[] = [
      {
        tool_calls: [{ id: 'c1', name: 'search_flights', args: {} }],
        tool_results: [{ tool_call_id: 'c1', name: 'search_flights', content: '{"flights":[]}' }],
      },
      {
        tool_calls: [{ id: 'c2', name: 'get_weather', args: {} }],
        tool_results: [{ tool_call_id: 'c2', name: 'get_weather', content: '{"temp":20}' }],
      },
    ];

    const msgs = lmRoundsToMessages(rounds);

    expect(msgs).toHaveLength(4); // (AIMessage + ToolMessage) × 2
    expect(msgs[0]).toBeInstanceOf(AIMessage);
    expect(msgs[1]).toBeInstanceOf(ToolMessage);
    expect(msgs[2]).toBeInstanceOf(AIMessage);
    expect(msgs[3]).toBeInstanceOf(ToolMessage);
  });
});

// ── historyToMessages ─────────────────────────────────────────────────────────

describe('historyToMessages', () => {
  it('converts a simple user/assistant exchange without tool calls', () => {
    const history = [
      { role: 'user' as const, content: 'Hi', agent_steps: null, lm_messages: null },
      { role: 'assistant' as const, content: 'Hello!', agent_steps: null, lm_messages: null },
    ];

    const msgs = historyToMessages(history);

    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBeInstanceOf(HumanMessage);
    expect(msgs[1]).toBeInstanceOf(AIMessage);
    expect((msgs[1] as AIMessage).content).toBe('Hello!');
  });

  it('expands assistant rows with lm_messages into full tool call sequences', () => {
    const history = [
      { role: 'user' as const, content: 'Find flights', agent_steps: null, lm_messages: null },
      {
        role: 'assistant' as const,
        content: 'Here are the flights.',
        agent_steps: null,
        lm_messages: [{
          tool_calls: [{ id: 'c1', name: 'search_flights', args: {} }],
          tool_results: [{ tool_call_id: 'c1', name: 'search_flights', content: '{"flights":[]}' }],
        }],
      },
    ];

    const msgs = historyToMessages(history);

    // HumanMessage + AIMessage(tool_calls) + ToolMessage + AIMessage(final text)
    expect(msgs).toHaveLength(4);
    expect(msgs[0]).toBeInstanceOf(HumanMessage);
    expect(msgs[1]).toBeInstanceOf(AIMessage);
    expect((msgs[1] as AIMessage).tool_calls).toHaveLength(1);
    expect(msgs[2]).toBeInstanceOf(ToolMessage);
    expect(msgs[3]).toBeInstanceOf(AIMessage);
    expect((msgs[3] as AIMessage).content).toBe('Here are the flights.');
  });

  it('returns only the final AIMessage for assistant rows with empty lm_messages', () => {
    const history = [
      { role: 'assistant' as const, content: 'Sure!', agent_steps: null, lm_messages: [] },
    ];

    const msgs = historyToMessages(history);

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBeInstanceOf(AIMessage);
  });
});
