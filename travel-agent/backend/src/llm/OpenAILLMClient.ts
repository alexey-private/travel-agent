import { LLMClient } from './LLMClient';
import { LLMCompleteParams, LLMStreamEvent, LLMStreamParams } from './types';

/**
 * OpenAI implementation of {@link LLMClient} — stub.
 *
 * ### To complete this implementation:
 * 1. `npm install openai --workspace=backend`
 * 2. Replace the stub bodies below with real OpenAI SDK calls.
 *
 * Key mapping from the Anthropic implementation:
 * - `stream()`    → `openai.chat.completions.create({ stream: true, ... })`
 *                   tool calls arrive in `delta.tool_calls[]` chunks
 * - `complete()`  → `openai.chat.completions.create({ stream: false, ... })`
 *                   response text is in `choices[0].message.content`
 *
 * Message format differences vs Anthropic:
 * - Tool calls:   assistant message has `tool_calls: [{ id, type, function: { name, arguments } }]`
 * - Tool results: separate `{ role: 'tool', tool_call_id, content }` messages (one per call)
 * - Tool schema:  `{ type: 'function', function: { name, description, parameters: <JSON Schema> } }`
 */
export class OpenAILLMClient implements LLMClient {
  constructor(_apiKey: string) {
    throw new Error('OpenAILLMClient is not yet implemented.');
  }

  async *stream(_params: LLMStreamParams): AsyncIterable<LLMStreamEvent> {
    throw new Error('OpenAILLMClient.stream() is not yet implemented.');
    // Silence "no yield" TypeScript error — unreachable in practice
    yield {} as LLMStreamEvent;
  }

  async complete(_params: LLMCompleteParams): Promise<string> {
    throw new Error('OpenAILLMClient.complete() is not yet implemented.');
  }
}
