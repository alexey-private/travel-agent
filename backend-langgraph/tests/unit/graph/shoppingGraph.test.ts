/**
 * Unit tests for the shopping graph factory (createShoppingGraph).
 *
 * The factory compiles a new graph on every call — no module-level singleton.
 * At server startup index.ts calls it once and stores the result via
 * fastify.decorate('shoppingGraph', ...). These tests verify the factory's
 * output and the prompt builder it passes to buildAgentGraph.
 */

import { createShoppingGraph } from '@/graph/shoppingGraph';
import { buildAgentGraph } from '@/graph/buildGraph';
import type { CalendarProvider } from '@/tools/providers/CalendarProvider';
import type { TasksProvider } from '@/tools/providers/TasksProvider';
import type { ConversationService } from '@/services/ConversationService';
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

// Mock buildAgentGraph so we never compile a real LangGraph StateGraph in tests.
// jest.mock is hoisted — return value is set per test/beforeAll instead.
jest.mock('@/graph/buildGraph', () => ({
  buildAgentGraph: jest.fn(),
}));

const mockBuildAgentGraph = buildAgentGraph as jest.Mock;
const mockCompiledGraph = { streamEvents: jest.fn(), invoke: jest.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockRag = { buildRagContext: jest.fn(), retrieve: jest.fn() } as unknown as RAGService;
const mockCalendar = {} as CalendarProvider;
const mockTasks = {} as TasksProvider;
const mockConversationService = {} as ConversationService;

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

describe('createShoppingGraph', () => {
  describe('graph construction', () => {
    // clearMocks:true in jest.config wipes mock.calls before each it, so capture
    // buildAgentGraph's call arguments here in beforeAll while they're still available.
    let result: ReturnType<typeof createShoppingGraph>;
    let capturedBuildPrompt: (state: AgentStateType) => string;
    let buildAgentGraphCallCount: number;

    beforeAll(() => {
      mockBuildAgentGraph.mockReturnValue(mockCompiledGraph);
      result = createShoppingGraph(mockRag, mockCalendar, mockTasks, mockConversationService);
      buildAgentGraphCallCount = mockBuildAgentGraph.mock.calls.length;
      [, capturedBuildPrompt] = mockBuildAgentGraph.mock.calls[0];
    });

    it('returns the compiled graph', () => {
      expect(result).toBe(mockCompiledGraph);
    });

    it('calls buildAgentGraph exactly once per invocation', () => {
      expect(buildAgentGraphCallCount).toBe(1);
    });

    it('passes a prompt builder function to buildAgentGraph', () => {
      expect(typeof capturedBuildPrompt).toBe('function');
    });

    it('prompt builder includes memories from state', () => {
      const state = makeState({ memories: [{ key: 'preferred_brands', value: 'Apple' }] });
      expect(capturedBuildPrompt(state)).toContain('Apple');
    });

    it('prompt builder includes userId from state', () => {
      const state = makeState({ userId: 'internal-uuid-shopper' });
      expect(capturedBuildPrompt(state)).toContain('internal-uuid-shopper');
    });

    it('prompt builder includes taskListName from state', () => {
      const state = makeState({ taskListName: 'My Wishlist Tasks' });
      expect(capturedBuildPrompt(state)).toContain('My Wishlist Tasks');
    });

    it('prompt builder produces different output when state changes', () => {
      const stateA = makeState({ memories: [{ key: 'budget_range', value: 'luxury' }] });
      const stateB = makeState({ memories: [{ key: 'budget_range', value: 'budget' }] });
      expect(capturedBuildPrompt(stateA)).not.toBe(capturedBuildPrompt(stateB));
    });
  });

  it('each call produces an independent graph instance', () => {
    const g1 = { streamEvents: jest.fn() };
    const g2 = { streamEvents: jest.fn() };
    mockBuildAgentGraph.mockReturnValueOnce(g1).mockReturnValueOnce(g2);
    const graph1 = createShoppingGraph(mockRag, mockCalendar, mockTasks, mockConversationService);
    const graph2 = createShoppingGraph(mockRag, mockCalendar, mockTasks, mockConversationService);
    expect(graph1).toBe(g1);
    expect(graph2).toBe(g2);
    expect(graph1).not.toBe(graph2);
  });
});
