/**
 * Unit tests for the shoppingGraph singleton (init/get pattern).
 */

import { initShoppingGraph, getShoppingGraph } from '@/graph/shoppingGraph';
import { buildAgentGraph } from '@/graph/buildGraph';
import type { CalendarProvider } from '@/tools/providers/CalendarProvider';
import type { TasksProvider } from '@/tools/providers/TasksProvider';
import type { RAGService } from '@/services/RAGService';
import type { AgentStateType } from '@/graph/state';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    TAVILY_API_KEY: 'test-tavily',
    PORT: 3000,
    NODE_ENV: 'test',
    REASONING_MODEL: 'claude-sonnet-4-6',
    FAST_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    bindTools: jest.fn().mockReturnThis(),
    invoke: jest.fn(),
  })),
}));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));

// Note: jest.mock is hoisted — factory must NOT reference outer `const` variables (TDZ).
jest.mock('@/graph/buildGraph', () => ({
  buildAgentGraph: jest.fn(),
}));

const mockBuildAgentGraph = buildAgentGraph as jest.Mock;
const mockCompiledGraph = { streamEvents: jest.fn(), invoke: jest.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockRag = { buildRagContext: jest.fn(), retrieve: jest.fn() } as unknown as RAGService;
const mockCalendar = {} as CalendarProvider;
const mockTasks = {} as TasksProvider;

function makeState(overrides: Partial<AgentStateType> = {}): AgentStateType {
  return {
    messages: [],
    userId: 'user-1',
    sessionId: 'session-1',
    conversationId: 'conv-1',
    agentType: 'shopping',
    memories: [],
    ragContext: null,
    taskListName: 'Shopping',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('shoppingGraph singleton', () => {
  it('getShoppingGraph throws before initShoppingGraph is called', () => {
    expect(() => getShoppingGraph()).toThrow('not initialised');
  });

  describe('after initShoppingGraph', () => {
    // clearMocks:true in jest.config wipes mock.calls before each it, so capture
    // buildAgentGraph's call arguments in beforeAll while they're still available.
    let capturedBuildPrompt: (state: AgentStateType) => string;
    let buildAgentGraphCallCount: number;

    beforeAll(() => {
      mockBuildAgentGraph.mockReturnValue(mockCompiledGraph);
      initShoppingGraph(mockRag, mockCalendar, mockTasks);
      buildAgentGraphCallCount = mockBuildAgentGraph.mock.calls.length;
      [, capturedBuildPrompt] = mockBuildAgentGraph.mock.calls[0];
    });

    it('returns the compiled graph', () => {
      expect(getShoppingGraph()).toBe(mockCompiledGraph);
    });

    it('is a singleton — same reference on repeated calls', () => {
      expect(getShoppingGraph()).toBe(getShoppingGraph());
    });

    it('calls buildAgentGraph exactly once', () => {
      expect(buildAgentGraphCallCount).toBe(1);
    });

    it('passes a prompt builder function to buildAgentGraph', () => {
      expect(typeof capturedBuildPrompt).toBe('function');
    });

    it('prompt builder includes memories from state', () => {
      const state = makeState({ memories: [{ key: 'preferred_brands', value: 'Apple' }] });
      expect(capturedBuildPrompt(state)).toContain('Apple');
    });

    it('prompt builder includes sessionId from state', () => {
      const state = makeState({ sessionId: 'shopper-session-42' });
      expect(capturedBuildPrompt(state)).toContain('shopper-session-42');
    });

    it('prompt builder includes taskListName from state', () => {
      const state = makeState({ taskListName: 'My Wishlist Tasks' });
      expect(capturedBuildPrompt(state)).toContain('My Wishlist Tasks');
    });

    it('reinitialisation replaces the singleton', () => {
      const newGraph = { streamEvents: jest.fn() };
      mockBuildAgentGraph.mockReturnValueOnce(newGraph);
      initShoppingGraph(mockRag, mockCalendar, mockTasks);
      expect(getShoppingGraph()).toBe(newGraph);
    });
  });
});
