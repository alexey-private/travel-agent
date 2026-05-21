import Anthropic from '@anthropic-ai/sdk';
import { LLMClient } from './LLMClient';
import {
  LLMCompleteParams,
  LLMMessage,
  LLMStreamEvent,
  LLMStreamParams,
  LLMToolCall,
  LLMToolDefinition,
} from './types';
import { env } from '../config/env';

const REASONING_MODEL = env.REASONING_MODEL;
const FAST_MODEL = env.FAST_MODEL;

/**
 * Anthropic implementation of {@link LLMClient}.
 *
 * Translates the provider-agnostic message format into Anthropic's
 * MessageParam shape on every call, so the rest of the codebase never
 * imports `@anthropic-ai/sdk` directly.
 */
export class AnthropicLLMClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' } });
  }

  async *stream(params: LLMStreamParams): AsyncIterable<LLMStreamEvent> {
    // Translate provider-agnostic types into Anthropic-specific shapes before the API call.
    const anthropicMessages = this.toAnthropicMessages(params.messages);
    const tools = params.tools.map(t => this.toAnthropicTool(t));

    // Open a streaming connection. The SDK returns an async iterable of raw SSE chunks
    // and also tracks the full response internally for finalMessage() below.
    const streamInstance = this.client.messages.stream({
      model: REASONING_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      // Omit the tools field entirely when none are registered — Anthropic rejects an empty array.
      tools: tools.length > 0 ? tools : undefined,
      messages: anthropicMessages,
    });

    let assistantText = '';

    // ── Phase 1: live text streaming ─────────────────────────────────────────
    // Yield each text token as it arrives so callers can display it incrementally.
    // We skip all other chunk types (content_block_start, ping, tool deltas, etc.)
    // because tool_use blocks are easier to read from finalMessage() below.
    for await (const chunk of streamInstance) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta' &&
        chunk.delta.text
      ) {
        assistantText += chunk.delta.text;
        yield { type: 'text_delta', text: chunk.delta.text };
      }
    }

    // ── Phase 2: final event ─────────────────────────────────────────────────
    // finalMessage() resolves once the stream is fully consumed and returns the
    // complete assembled response — including tool_use blocks that arrived as
    // partial deltas during streaming. Using it avoids manually reassembling
    // fragmented tool JSON from the raw chunk stream.
    const response = await streamInstance.finalMessage();

    // Extract all tool calls requested by the model in this turn (may be empty).
    const toolCalls: LLMToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input }));

    // Normalize Anthropic's stop_reason to our provider-agnostic union.
    const reason =
      response.stop_reason === 'end_turn'
        ? 'end_turn'
        : response.stop_reason === 'tool_use'
          ? 'tool_use'
          : 'other';

    // Emit exactly one 'stop' event per turn — callers use this to decide
    // whether to execute tool calls (tool_use) or finish the ReAct loop (end_turn).
    yield { type: 'stop', reason, toolCalls, assistantText };
  }

  async complete(params: LLMCompleteParams): Promise<string> {
    const response = await this.client.messages.create({
      model: FAST_MODEL,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toAnthropicTool(tool: LLMToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    };
  }

  /**
   * Maps the provider-agnostic LLMMessage union to Anthropic's MessageParam.
   *
   * Anthropic encodes tool calls inside the assistant content array and tool
   * results as a user turn — both differ from OpenAI's approach, which is why
   * this translation lives here rather than in shared types.
   */
  private toAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      // Tool results — one user turn containing all results from the previous tool_use
      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: msg.results.map(r => ({
            type: 'tool_result' as const,
            tool_use_id: r.toolCallId,
            content: r.content,
            is_error: r.isError,
          })),
        };
      }

      // Assistant turn that included tool calls — content must interleave text and tool_use blocks
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: 'assistant' as const,
          content: [
            ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
            ...msg.toolCalls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.input as Record<string, unknown>,
            })),
          ],
        };
      }

      // User turn: plain text or multimodal content blocks
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          // UserContentBlock[] is structurally compatible with Anthropic.ContentBlockParam[]
          content: msg.content as Anthropic.MessageParam['content'],
        };
      }

      // Plain assistant text
      return { role: 'assistant' as const, content: msg.content as string };
    });
  }
}
