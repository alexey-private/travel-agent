import { JSONSchema } from '../types/tools';

/** Provider-agnostic tool definition passed to the LLM. */
export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/** A tool invocation requested by the model. */
export interface LLMToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** A tool result to feed back to the model. */
export interface LLMToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/**
 * Provider-agnostic conversation message.
 *
 * - 'user'      — plain text from the human turn
 * - 'assistant' — model response; may include tool calls when the model chose
 *                 to invoke tools in that turn
 * - 'tool'      — the results for every tool call in the preceding assistant turn;
 *                 mapped to provider-specific tool_result format by each LLMClient
 */
export type LLMMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LLMToolCall[] }
  | { role: 'tool'; results: LLMToolResult[] };

/** Parameters for a streaming agent turn. */
export interface LLMStreamParams {
  system: string;
  tools: LLMToolDefinition[];
  messages: LLMMessage[];
  maxTokens?: number;
}

/**
 * Events emitted during a streaming turn.
 *
 * - 'text_delta' — incremental text token, emitted while the model is generating
 * - 'stop'       — final event; always emitted once per turn
 *   - reason 'end_turn'  — model finished normally; toolCalls will be empty
 *   - reason 'tool_use'  — model wants to call tools; toolCalls will be populated
 *   - reason 'other'     — max_tokens or other stop condition
 */
export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | {
      type: 'stop';
      reason: 'end_turn' | 'tool_use' | 'other';
      toolCalls: LLMToolCall[];
      assistantText: string;
    };

/** Parameters for a simple (non-streaming) completion. */
export interface LLMCompleteParams {
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}
