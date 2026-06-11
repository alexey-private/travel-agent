/**
 * Unit tests for the travelGraph singleton (init/get pattern).
 *
 * The module-level _travelGraph variable starts null when the module is first loaded
 * by Jest. Tests are ordered so that the "throws before init" case runs first,
 * then a shared beforeAll calls initTravelGraph once for the remaining tests.
 */

import { initTravelGraph, getTravelGraph } from '@/graph/travelGraph';
import { buildAgentGraph } from '@/graph/buildGraph';
import type { CalendarProvider } from '@/tools/providers/CalendarProvider';
import type { TasksProvider } from '@/tools/providers/TasksProvider';
import type { AgentStateType } from '@/graph/state';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/config/env', () => ({
  env: {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    TAVILY_API_KEY: 'test-tavily',
    OPENWEATHER_API_KEY: 'test-weather',
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

// Mock buildAgentGraph so we never actually compile a LangGraph StateGraph in tests.
// Note: jest.mock is hoisted — the factory must NOT reference outer `const` variables
// (they are in TDZ when the factory runs). Return value is set in beforeAll instead.
jest.mock('@/graph/buildGraph', () => ({
  buildAgentGraph: jest.fn(),
}));

const mockBuildAgentGraph = buildAgentGraph as jest.Mock;
const mockCompiledGraph = { streamEvents: jest.fn(), invoke: jest.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockCalendar = {} as CalendarProvider;
const mockTasks = {} as TasksProvider;

function makeState(overrides: Partial<AgentStateType> = {}): AgentStateType {
  return {
    messages: [],
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

describe('travelGraph singleton', () => {
  // This test MUST run first — the module starts with _travelGraph = null.
  it('getTravelGraph throws before initTravelGraph is called', () => {
    expect(() => getTravelGraph()).toThrow('not initialised');
  });

  describe('after initTravelGraph', () => {
    // clearMocks:true in jest.config wipes mock.calls before each it, so capture
    // buildAgentGraph's call arguments here in beforeAll while they're still available.
    let capturedBuildPrompt: (state: AgentStateType) => string;
    let buildAgentGraphCallCount: number;

    beforeAll(() => {
      mockBuildAgentGraph.mockReturnValue(mockCompiledGraph);
      initTravelGraph(mockCalendar, mockTasks);
      buildAgentGraphCallCount = mockBuildAgentGraph.mock.calls.length;
      [, capturedBuildPrompt] = mockBuildAgentGraph.mock.calls[0];
    });

    it('returns the compiled graph', () => {
      expect(getTravelGraph()).toBe(mockCompiledGraph);
    });

    it('is a singleton — same reference on repeated calls', () => {
      expect(getTravelGraph()).toBe(getTravelGraph());
    });

    it('calls buildAgentGraph exactly once', () => {
      expect(buildAgentGraphCallCount).toBe(1);
    });

    it('passes a prompt builder function (not a string) to buildAgentGraph', () => {
      expect(typeof capturedBuildPrompt).toBe('function');
    });

    it('prompt builder includes memories from state', () => {
      const state = makeState({ memories: [{ key: 'home_city', value: 'Tel Aviv' }] });
      expect(capturedBuildPrompt(state)).toContain('Tel Aviv');
    });

    it('prompt builder includes sessionId from state', () => {
      const state = makeState({ sessionId: 'user-session-xyz' });
      expect(capturedBuildPrompt(state)).toContain('user-session-xyz');
    });

    it('prompt builder includes taskListName from state', () => {
      const state = makeState({ taskListName: 'My Trips' });
      expect(capturedBuildPrompt(state)).toContain('My Trips');
    });

    it('prompt builder produces different output when state changes', () => {
      const stateA = makeState({ memories: [{ key: 'airline', value: 'EL AL' }] });
      const stateB = makeState({ memories: [{ key: 'airline', value: 'United' }] });
      expect(capturedBuildPrompt(stateA)).not.toBe(capturedBuildPrompt(stateB));
    });

    it('reinitialisation replaces the singleton', () => {
      const newGraph = { streamEvents: jest.fn() };
      mockBuildAgentGraph.mockReturnValueOnce(newGraph);
      initTravelGraph(mockCalendar, mockTasks);
      expect(getTravelGraph()).toBe(newGraph);
    });
  });
});
