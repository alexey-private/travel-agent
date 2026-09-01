/**
 * Unit tests for createReasonNode.
 *
 * Verifies that the node:
 *   - Calls the prompt builder with the current state on every invocation
 *   - Passes [SystemMessage(prompt), ...state.messages] to the bound model
 *   - Returns { messages: [response] }
 *   - Creates the model once in the closure (not per-invocation)
 *   - Falls back to the standby provider when the primary one fails, and
 *     deliberately does not when the answer has already started streaming or
 *     the request was aborted
 *   - Builds the system message for the provider about to answer: Anthropic's
 *     cache_control block never reaches the standby
 */

import { createReasonNode } from '@/graph/nodes/reasonNode';
import { __resetFallbackStateForTests } from '@/llm/providerFallback';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getCallbackManagerForConfig, type RunnableConfig } from '@langchain/core/runnables';
import type { CallbackManager } from '@langchain/core/callbacks/manager';
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
// The standby gets spies of its own, so a test can prove *which* provider answered
// rather than merely that something did.
const mockOpenAIInvoke = jest.fn();
const mockOpenAIBindTools = jest.fn();

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    bindTools: mockBindTools,
  })),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    bindTools: mockOpenAIBindTools,
  })),
}));

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

type TokenHandler = { handleLLMNewToken?: (token: string) => void };

/**
 * Fires a streamed token through the very config the node built, which is the
 * only honest way to test the "already streaming" veto: a stubbed flag would
 * prove the veto works while saying nothing about whether the callback that
 * sets it ever reaches the model.
 */
function fireNewToken(config: RunnableConfig): void {
  const callbacks = config.callbacks;
  // An array when the node is called bare, a CallbackManager when LangGraph
  // calls it — mergeConfigs merges into either, and both shapes are tested.
  const handlers = Array.isArray(callbacks)
    ? (callbacks as TokenHandler[])
    : ((callbacks as CallbackManager).handlers as unknown as TokenHandler[]);
  for (const handler of handlers) handler.handleLLMNewToken?.('tok');
}

/** The system message a provider's invoke spy was handed. */
function sysMessageOf(invokeSpy: jest.Mock, call = 0): SystemMessage {
  return invokeSpy.mock.calls[call][0][0] as SystemMessage;
}

function sysTextOf(invokeSpy: jest.Mock, call = 0): string {
  const content = sysMessageOf(invokeSpy, call).content;
  return typeof content === 'string' ? content : (content[0] as { text: string }).text;
}

/** Every key appearing on the system content's blocks; empty for plain-string content. */
function sysContentKeys(invokeSpy: jest.Mock, call = 0): string[] {
  const content = sysMessageOf(invokeSpy, call).content;
  return typeof content === 'string' ? [] : content.flatMap(block => Object.keys(block as object));
}

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createReasonNode', () => {
  const mockTools = [] as unknown as DynamicStructuredTool[];
  const mockResponse = new AIMessage('Here is your itinerary.');
  const standbyResponse = new AIMessage('Here is your itinerary, from the standby.');

  beforeEach(() => {
    __resetFallbackStateForTests();
    mockInvoke.mockReset().mockResolvedValue(mockResponse);
    mockBindTools.mockReset().mockReturnValue({ invoke: mockInvoke });
    mockOpenAIInvoke.mockReset().mockResolvedValue(standbyResponse);
    mockOpenAIBindTools.mockReset().mockReturnValue({ invoke: mockOpenAIInvoke });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  // ── Provider fallback ───────────────────────────────────────────────────────

  describe('provider fallback', () => {
    const buildPrompt = () => 'prompt';

    it('answers from the standby provider when the primary one fails', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('credit balance is too low'));
      const node = createReasonNode(buildPrompt, mockTools);

      const result = await node(makeState());

      expect(mockOpenAIInvoke).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ messages: [standbyResponse] });
    });

    it('hands the standby the same conversation and the same prompt text', async () => {
      // The same conversation, deliberately not the same system message — see the
      // cache_control cases below.
      mockInvoke.mockRejectedValueOnce(new Error('down'));
      const node = createReasonNode(buildPrompt, mockTools);
      const userMsg = new HumanMessage('Find flights to Paris');

      await node(makeState({ messages: [userMsg] }));

      const [standbyMessages] = mockOpenAIInvoke.mock.calls[0];
      expect(standbyMessages).toHaveLength(2);
      expect(standbyMessages[1]).toBe(userMsg);
      expect(sysTextOf(mockOpenAIInvoke)).toBe(sysTextOf(mockInvoke));
    });

    it("keeps Anthropic's prompt-caching block on the primary's system message", async () => {
      // The block is what the feature is for; stripping it everywhere would fix
      // the standby by paying for the primary's prompt on every turn.
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState());

      expect(sysMessageOf(mockInvoke).content).toEqual([
        { type: 'text', text: 'prompt', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it("never sends Anthropic's cache_control to the standby", async () => {
      // @langchain/openai sends SystemMessage as role "developer" for gpt-5.x, and
      // OpenAI rejects an unknown key on a developer-role content block:
      // 400 Unknown parameter: 'messages[0].content[0].cache_control'. Under
      // role "system" — what gpt-4o gets — the same block passes, so this is
      // invisible until the standby's model id leaves the gpt-4 family.
      mockInvoke.mockRejectedValueOnce(new Error('down'));
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState());

      expect(JSON.stringify(sysMessageOf(mockOpenAIInvoke).content)).not.toContain('cache_control');
    });

    it('gives the standby a system message carrying no vendor keys at all', async () => {
      // Named keys only would make this "delete the one extension we were bitten
      // by"; the rule is that a non-Anthropic attempt gets the portable shape.
      mockInvoke.mockRejectedValueOnce(new Error('down'));
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState());

      // Pin the shape, not just its keys. A vendor key can only hide in a content
      // block, so a scan that runs over plain-string content passes whatever the
      // node does — a tautology wearing this test's name. The scan below still
      // earns its place: it is what covers a deliberate future move to blocks.
      expect(typeof sysMessageOf(mockOpenAIInvoke).content).toBe('string');

      const extraneous = sysContentKeys(mockOpenAIInvoke).filter(
        key => key !== 'type' && key !== 'text',
      );
      expect(extraneous).toEqual([]);
    });

    it('binds the standby to the very tools array the primary was bound to', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('down'));
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState());

      // toBe, not toEqual: R5 is about the same array, and every empty array is
      // deep-equal to every other one.
      expect(mockOpenAIBindTools.mock.calls[0][0]).toBe(mockTools);
    });

    it('never constructs the standby while the primary is answering', async () => {
      const { ChatOpenAI } = jest.requireMock('@langchain/openai') as { ChatOpenAI: jest.Mock };
      ChatOpenAI.mockClear();
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState());
      await node(makeState());

      expect(ChatOpenAI).not.toHaveBeenCalled();
    });

    it('constructs the standby once and reuses it across further failures', async () => {
      const { ChatOpenAI } = jest.requireMock('@langchain/openai') as { ChatOpenAI: jest.Mock };
      ChatOpenAI.mockClear();
      mockInvoke.mockRejectedValue(new Error('down'));
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState());
      await node(makeState());

      expect(ChatOpenAI).toHaveBeenCalledTimes(1);
      expect(mockOpenAIInvoke).toHaveBeenCalledTimes(2);
    });

    it('does not divert an attempt that had already streamed a token', async () => {
      // The frontend appends text, so a second full answer would be pasted onto
      // the tail of the truncated one.
      mockInvoke.mockImplementation(async (_messages, config: RunnableConfig) => {
        fireNewToken(config);
        throw new Error('socket died mid-stream');
      });
      const node = createReasonNode(buildPrompt, mockTools);

      await expect(node(makeState())).rejects.toThrow('socket died mid-stream');
      expect(mockOpenAIInvoke).not.toHaveBeenCalled();
    });

    it("does not let one request's stream veto a later request's retry", async () => {
      // The model is a singleton shared by concurrent requests, so `streamed`
      // has to be declared per invocation. Hoist it into the node's closure and
      // the first request's token permanently vetoes everyone else's fallback.
      mockInvoke.mockImplementationOnce(async (_messages, config: RunnableConfig) => {
        fireNewToken(config);
        throw new Error('socket died mid-stream');
      });
      const node = createReasonNode(buildPrompt, mockTools);
      await expect(node(makeState())).rejects.toThrow('socket died mid-stream');

      mockInvoke.mockRejectedValueOnce(new Error('down'));
      const result = await node(makeState());

      expect(result).toEqual({ messages: [standbyResponse] });
    });

    it('does not divert an aborted attempt', async () => {
      mockInvoke.mockRejectedValueOnce(abortError());
      const node = createReasonNode(buildPrompt, mockTools);

      await expect(node(makeState())).rejects.toThrow('Aborted');
      expect(mockOpenAIInvoke).not.toHaveBeenCalled();
    });

    it("reads the request's abort signal off the config it was called with", async () => {
      // The socket can throw anything on its way down; what makes it an abort is
      // the signal, which only reaches the engine if the node passes it on.
      const controller = new AbortController();
      controller.abort();
      mockInvoke.mockRejectedValueOnce(new Error('socket hang up'));
      const node = createReasonNode(buildPrompt, mockTools);

      await expect(node(makeState(), { signal: controller.signal })).rejects.toThrow('socket hang up');
      expect(mockOpenAIInvoke).not.toHaveBeenCalled();
    });

    it('adds its token spy to the callbacks LangGraph supplied, not over them', async () => {
      // ensureConfig would replace `callbacks` wholesale, detaching the run from
      // streamEvents — green tests, and no text reaching the browser.
      const parentHandler = { handleLLMNewToken: jest.fn() };
      const node = createReasonNode(buildPrompt, mockTools);

      await node(makeState(), { callbacks: [parentHandler], runName: 'reason' });

      const [, cfg] = mockInvoke.mock.calls[0];
      expect(cfg.callbacks).toContain(parentHandler);
      expect(cfg.callbacks).toHaveLength(2);
      expect(cfg.runName).toBe('reason');
    });

    it('does the same when the callbacks arrive as a CallbackManager', async () => {
      // The branch above is not the one production takes. LangGraph builds the
      // node's config with `patchConfig(config, { callbacks: runManager.getChild() })`,
      // and getChild returns a CallbackManager, never an array — mergeConfigs has
      // a separate branch for it (copy() + addHandler). A regression confined to
      // that branch would leave the array test green and the browser silent.
      const parent = await getCallbackManagerForConfig({
        callbacks: [{ handleLLMNewToken: jest.fn() }],
      });
      const parentHandler = parent.handlers[0];

      mockInvoke.mockImplementation(async (_messages, config: RunnableConfig) => {
        fireNewToken(config);
        throw new Error('socket died mid-stream');
      });
      const node = createReasonNode(buildPrompt, mockTools);

      // The veto fired, so the spy reached the model through the manager.
      await expect(node(makeState(), { callbacks: parent })).rejects.toThrow('socket died mid-stream');
      expect(mockOpenAIInvoke).not.toHaveBeenCalled();

      const [, cfg] = mockInvoke.mock.calls[0];
      expect(Array.isArray(cfg.callbacks)).toBe(false);
      expect((cfg.callbacks as CallbackManager).handlers).toContain(parentHandler);
    });
  });
});
