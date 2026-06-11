/**
 * Unit tests for createReasonNode.
 *
 * Verifies that the node:
 *   - Calls the prompt builder with the current state on every invocation
 *   - Passes [SystemMessage(prompt), ...state.messages] to the bound model
 *   - Returns { messages: [response] }
 *   - Creates the model once in the closure (not per-invocation)
 */

import { createReasonNode } from '@/graph/nodes/reasonNode';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { AgentStateType } from '@/graph/state';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    PORT: 3000,
    NODE_ENV: 'test',
    REASONING_MODEL: 'claude-sonnet-4-6',
    FAST_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

const mockInvoke = jest.fn();
const mockBindTools = jest.fn();

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    bindTools: mockBindTools,
  })),
}));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AgentStateType> = {}): AgentStateType {
  return {
    messages: [new HumanMessage('Plan a trip to Tokyo')],
    userId: 'user-1',
    sessionId: 'session-1',
    conversationId: 'conv-1',
    agentType: 'travel',
    memories: [],
    ragContext: null,
    taskListName: 'Travel Plans',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createReasonNode', () => {
  const mockTools = [] as unknown as DynamicStructuredTool[];
  const mockResponse = new AIMessage('Here is your itinerary.');

  beforeEach(() => {
    mockInvoke.mockReset().mockResolvedValue(mockResponse);
    mockBindTools.mockReset().mockReturnValue({ invoke: mockInvoke });
  });

  it('calls buildSystemPrompt with the current state on every invoke', async () => {
    const buildPrompt = jest.fn().mockReturnValue('You are a travel agent.');
    const node = createReasonNode(buildPrompt, mockTools);
    const state = makeState({ memories: [{ key: 'diet', value: 'vegan' }] });

    await node(state);

    expect(buildPrompt).toHaveBeenCalledTimes(1);
    expect(buildPrompt).toHaveBeenCalledWith(state);
  });

  it('passes SystemMessage(prompt) as the first message to model.invoke', async () => {
    const buildPrompt = jest.fn().mockReturnValue('Custom travel system prompt.');
    const node = createReasonNode(buildPrompt, mockTools);

    await node(makeState());

    const [messages] = mockInvoke.mock.calls[0];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    // content is a cache-control block array; extract the text field
    const sysContent = messages[0].content;
    const sysText = Array.isArray(sysContent)
      ? (sysContent[0] as { text: string }).text
      : sysContent;
    expect(sysText).toBe('Custom travel system prompt.');
  });

  it('appends state.messages after the system message', async () => {
    const buildPrompt = jest.fn().mockReturnValue('prompt');
    const node = createReasonNode(buildPrompt, mockTools);
    const userMsg = new HumanMessage('Find flights to Paris');

    await node(makeState({ messages: [userMsg] }));

    const [messages] = mockInvoke.mock.calls[0];
    expect(messages).toHaveLength(2);
    expect(messages[1]).toBe(userMsg);
  });

  it('returns { messages: [response] }', async () => {
    const buildPrompt = jest.fn().mockReturnValue('prompt');
    const node = createReasonNode(buildPrompt, mockTools);

    const result = await node(makeState());

    expect(result).toEqual({ messages: [mockResponse] });
  });

  it('re-evaluates buildSystemPrompt on every call (dynamic prompt, not cached)', async () => {
    let callCount = 0;
    const buildPrompt = jest.fn().mockImplementation(() => `Prompt #${++callCount}`);
    const node = createReasonNode(buildPrompt, mockTools);

    await node(makeState());
    await node(makeState());

    const sysText = (msg: SystemMessage) => {
      const c = msg.content;
      return Array.isArray(c) ? (c[0] as { text: string }).text : c;
    };
    expect(buildPrompt).toHaveBeenCalledTimes(2);
    expect(sysText(mockInvoke.mock.calls[0][0][0])).toBe('Prompt #1');
    expect(sysText(mockInvoke.mock.calls[1][0][0])).toBe('Prompt #2');
  });

  it('creates the model once in the closure, not per invocation', async () => {
    const { ChatAnthropic } = jest.requireMock('@langchain/anthropic') as {
      ChatAnthropic: jest.Mock;
    };
    ChatAnthropic.mockClear();

    const buildPrompt = jest.fn().mockReturnValue('prompt');
    const node = createReasonNode(buildPrompt, mockTools);

    // Invoke the node 3 times
    await node(makeState());
    await node(makeState());
    await node(makeState());

    // ChatAnthropic constructor should have been called only once (at closure creation)
    expect(ChatAnthropic).toHaveBeenCalledTimes(1);
  });

  it('passes the tools to bindTools when creating the model', () => {
    const buildPrompt = jest.fn().mockReturnValue('prompt');
    createReasonNode(buildPrompt, mockTools);

    expect(mockBindTools).toHaveBeenCalledWith(mockTools);
  });
});
