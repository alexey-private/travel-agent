import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { env, type Env } from '../config/env';

export type Provider = 'anthropic' | 'openai';

export type ModelSize = 'fast' | 'full';

interface ModelOptions {
  maxTokens?: number;
  streaming?: boolean;
}

const MODEL_DEFAULTS: Record<Provider, Record<ModelSize, string>> = {
  anthropic: { full: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5-20251001' },
  openai: { full: 'gpt-4o', fast: 'gpt-4o-mini' },
};

// `keyof Env`, not `string`: these names have to match the zod schema exactly,
// and the runtime lookup below goes through an index signature that would happily
// swallow a typo or a later rename in env.ts.
const PER_PROVIDER_KEY: Record<Provider, Record<ModelSize, keyof Env>> = {
  anthropic: { full: 'ANTHROPIC_REASONING_MODEL', fast: 'ANTHROPIC_FAST_MODEL' },
  openai: { full: 'OPENAI_REASONING_MODEL', fast: 'OPENAI_FAST_MODEL' },
};

/**
 * Which model id a given provider uses for a given size — a pure function of the
 * pair, deliberately not of the *active* provider. Reading `REASONING_MODEL` for
 * a standby is how a fallback ends up asking OpenAI for a Claude model.
 *
 * Order, highest first:
 *   1. ANTHROPIC_* / OPENAI_* — per-provider, always win.
 *   2. REASONING_MODEL / FAST_MODEL — only for the ACTIVE provider, which is
 *      what they have always meant, so nothing deployed changes meaning.
 *   3. The built-in default for that provider.
 *
 * Read through an index signature because a test mocking `@/config/env` supplies
 * only the keys that concern it; a missing one has to read as "not set", not as
 * a type error waiting for 24 mocks to be edited.
 */
export function modelId(provider: Provider, size: ModelSize): string {
  const specific = (env as unknown as Record<string, unknown>)[PER_PROVIDER_KEY[provider][size]];
  if (typeof specific === 'string' && specific) return specific;

  if (provider === env.LLM_PROVIDER) {
    const generic = size === 'full' ? env.REASONING_MODEL : env.FAST_MODEL;
    if (generic) return generic;
  }

  return MODEL_DEFAULTS[provider][size];
}

/**
 * Returns a configured chat model.
 *
 * 'fast' → Claude Haiku / GPT-4o-mini  (memory extraction, suggestions, RAG gating)
 * 'full' → Claude Sonnet / GPT-4o      (main reasoning loop in reasonNode)
 *
 * `provider` defaults to the active one, so every existing two-argument call
 * means exactly what it meant before. Passing it explicitly is what lets the
 * fallback build a standby while the active provider is something else.
 */
export function createModel(
  size: ModelSize,
  maxTokensOrOptions?: number | ModelOptions,
  provider: Provider = env.LLM_PROVIDER,
): BaseChatModel {
  const opts: ModelOptions = typeof maxTokensOrOptions === 'number'
    ? { maxTokens: maxTokensOrOptions }
    : (maxTokensOrOptions ?? {});

  const { maxTokens, streaming } = opts;

  if (provider === 'openai') {
    return new ChatOpenAI({
      model: modelId('openai', size),
      apiKey: env.OPENAI_API_KEY,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(streaming !== undefined ? { streaming } : {}),
    }) as BaseChatModel;
  }

  const model = new ChatAnthropic({
    model: modelId('anthropic', size),
    apiKey: env.ANTHROPIC_API_KEY,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(streaming !== undefined ? { streaming } : {}),
    // Enable PDF document support (document content blocks)
    clientOptions: { defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' } },
  }) as BaseChatModel;

  // LangChain sets topP=-1 as a sentinel meaning "not set", but Anthropic API
  // rejects it for claude-sonnet-4-6+. Force it to undefined so it's omitted.
  (model as unknown as Record<string, unknown>).topP = undefined;

  return model;
}
