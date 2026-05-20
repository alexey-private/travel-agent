import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { env } from '../config/env';

type ModelSize = 'fast' | 'full';

interface ModelOptions {
  maxTokens?: number;
  streaming?: boolean;
}

/**
 * Returns a configured chat model for the active LLM provider.
 *
 * 'fast' → Claude Haiku / GPT-4o-mini  (memory extraction, suggestions, RAG gating)
 * 'full' → Claude Sonnet / GPT-4o      (main reasoning loop in reasonNode)
 */
export function createModel(size: ModelSize, maxTokensOrOptions?: number | ModelOptions): BaseChatModel {
  const opts: ModelOptions = typeof maxTokensOrOptions === 'number'
    ? { maxTokens: maxTokensOrOptions }
    : (maxTokensOrOptions ?? {});

  const { maxTokens, streaming } = opts;

  if (env.LLM_PROVIDER === 'openai') {
    return new ChatOpenAI({
      model: size === 'full' ? 'gpt-4o' : 'gpt-4o-mini',
      apiKey: env.OPENAI_API_KEY,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(streaming !== undefined ? { streaming } : {}),
    }) as BaseChatModel;
  }

  const model = new ChatAnthropic({
    model: size === 'full' ? env.REASONING_MODEL : env.FAST_MODEL,
    apiKey: env.ANTHROPIC_API_KEY,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(streaming !== undefined ? { streaming } : {}),
  }) as BaseChatModel;

  // LangChain sets topP=-1 as a sentinel meaning "not set", but Anthropic API
  // rejects it for claude-sonnet-4-6+. Force it to undefined so it's omitted.
  (model as unknown as Record<string, unknown>).topP = undefined;

  return model;
}
