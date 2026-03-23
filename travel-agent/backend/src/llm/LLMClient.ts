import { LLMCompleteParams, LLMStreamEvent, LLMStreamParams } from './types';

/**
 * Provider-agnostic LLM client interface.
 *
 * Two capabilities are separated intentionally:
 *
 * - `stream`   — used by TravelAgent for the multi-turn ReAct loop; yields
 *               incremental text deltas followed by a final stop event.
 * - `complete` — used by MemoryService, RAGService, and SuggestionService for
 *               lightweight single-turn tasks (extraction, classification,
 *               suggestion generation).
 *
 * Use {@link LLMClientFactory} to obtain a concrete instance.
 */
export interface LLMClient {
  stream(params: LLMStreamParams): AsyncIterable<LLMStreamEvent>;
  complete(params: LLMCompleteParams): Promise<string>;
}
