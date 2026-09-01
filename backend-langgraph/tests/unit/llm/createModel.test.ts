/**
 * Which model id each provider is built with, and which construction details
 * belong to which branch.
 *
 * The bug being guarded against: model ids used to be resolved against the
 * *active* provider, so a standby `ChatOpenAI` constructed while
 * `LLM_PROVIDER=anthropic` would have been asked for `claude-sonnet-4-6`.
 * `modelId` is a pure function of (provider, size) precisely so that cannot
 * happen.
 *
 * The env module is mocked with one mutable object rather than reloaded per
 * case: `modelId` reads `env` at call time, so assigning between cases is
 * enough, and each case then states only the two or three keys it is about.
 */

jest.mock('@/config/env', () => ({ env: {} }));

jest.mock('@langchain/anthropic', () => ({
  // topP: -1 is the sentinel LangChain sets for "not specified". The factory is
  // expected to blank it out, and returning it here is what lets a test see so.
  ChatAnthropic: jest.fn().mockImplementation(() => ({ topP: -1 })),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
}));

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '@/config/env';
import { createModel, modelId } from '@/llm/createModel';

const AnthropicCtor = ChatAnthropic as unknown as jest.Mock;
const OpenAICtor = ChatOpenAI as unknown as jest.Mock;

/** The very object the mock factory made, so mutating it is what `env` reads. */
const mutableEnv = env as unknown as Record<string, unknown>;

const BASE = {
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'ant-key',
  OPENAI_API_KEY: 'oai-key',
};

function setEnv(values: Record<string, unknown>): void {
  for (const key of Object.keys(mutableEnv)) delete mutableEnv[key];
  Object.assign(mutableEnv, BASE, values);
}

function anthropicArgs(): Record<string, unknown> {
  return AnthropicCtor.mock.calls[0][0] as Record<string, unknown>;
}
function openaiArgs(): Record<string, unknown> {
  return OpenAICtor.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  setEnv({});
});

describe('modelId', () => {
  it('resolves both providers from an env carrying none of the new keys', () => {
    // Exactly the shape the existing test mocks have: the two generic keys and
    // nothing else. The standby must still come out with ids of its own.
    setEnv({
      REASONING_MODEL: 'claude-sonnet-4-6',
      FAST_MODEL: 'claude-haiku-4-5-20251001',
    });

    expect(modelId('anthropic', 'full')).toBe('claude-sonnet-4-6');
    expect(modelId('anthropic', 'fast')).toBe('claude-haiku-4-5-20251001');
    expect(modelId('openai', 'full')).toBe('gpt-4o');
    expect(modelId('openai', 'fast')).toBe('gpt-4o-mini');
  });

  it('lets the per-provider key win over the generic one', () => {
    setEnv({
      REASONING_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_REASONING_MODEL: 'claude-opus-5',
      OPENAI_FAST_MODEL: 'gpt-4o-mini-2026',
    });

    expect(modelId('anthropic', 'full')).toBe('claude-opus-5');
    expect(modelId('openai', 'fast')).toBe('gpt-4o-mini-2026');
  });

  it('does not leak the generic key across providers', () => {
    // FAST_MODEL means "the active provider's fast model" and always has.
    setEnv({ LLM_PROVIDER: 'openai', FAST_MODEL: 'gpt-4o-mini' });

    expect(modelId('openai', 'fast')).toBe('gpt-4o-mini');
    expect(modelId('anthropic', 'fast')).toBe('claude-haiku-4-5-20251001');
  });
});

describe('createModel', () => {
  it('reproduces the current behaviour when the provider argument is omitted', () => {
    setEnv({ REASONING_MODEL: 'claude-sonnet-4-6' });

    createModel('full');

    expect(OpenAICtor).not.toHaveBeenCalled();
    expect(AnthropicCtor).toHaveBeenCalledTimes(1);
    expect(anthropicArgs()).toMatchObject({
      model: 'claude-sonnet-4-6',
      apiKey: 'ant-key',
    });
  });

  it('never gives a standby the active provider’s model id', () => {
    setEnv({ REASONING_MODEL: 'claude-sonnet-4-6' });

    createModel('full', undefined, 'openai');

    expect(AnthropicCtor).not.toHaveBeenCalled();
    expect(openaiArgs()).toMatchObject({ model: 'gpt-4o', apiKey: 'oai-key' });
  });

  it('passes maxTokens and streaming through on the standby branch too', () => {
    createModel('fast', 150, 'openai');
    expect(openaiArgs()).toMatchObject({ maxTokens: 150 });

    OpenAICtor.mockClear();
    createModel('full', { streaming: true }, 'openai');
    expect(openaiArgs()).toMatchObject({ streaming: true });
  });

  it('keeps the Anthropic-only construction details on the Anthropic branch', () => {
    const model = createModel('full', undefined, 'anthropic') as unknown as Record<string, unknown>;

    expect(anthropicArgs()).toMatchObject({
      clientOptions: { defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' } },
    });
    // The topP: -1 sentinel is rejected by the Anthropic API for sonnet-4-6+.
    expect(model.topP).toBeUndefined();
  });

  it('does not carry the Anthropic PDF header onto OpenAI', () => {
    createModel('full', undefined, 'openai');

    expect(openaiArgs().clientOptions).toBeUndefined();
  });
});
