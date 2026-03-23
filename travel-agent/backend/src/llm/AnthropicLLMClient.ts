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

/**
 * Claude is used in two roles with different cost/capability trade-offs:
 * - Sonnet for the main ReAct loop (complex reasoning + tool orchestration)
 * - Haiku for lightweight single-turn tasks (extraction, classification, suggestions)
 */
const REASONING_MODEL = 'claude-sonnet-4-6';
const FAST_MODEL = 'claude-haiku-4-5-20251001';

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
    this.client = new Anthropic({ apiKey });
  }

  async *stream(params: LLMStreamParams): AsyncIterable<LLMStreamEvent> {
    const anthropicMessages = this.toAnthropicMessages(params.messages);
    const tools = params.tools.map(t => this.toAnthropicTool(t));

    const streamInstance = this.client.messages.stream({
      model: REASONING_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      tools: tools.length > 0 ? tools : undefined,
      messages: anthropicMessages,
    });

    let assistantText = '';

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

    const response = await streamInstance.finalMessage();

    const toolCalls: LLMToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input }));

    const reason =
      response.stop_reason === 'end_turn'
        ? 'end_turn'
        : response.stop_reason === 'tool_use'
          ? 'tool_use'
          : 'other';

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

      // Plain user or assistant text
      return { role: msg.role as 'user' | 'assistant', content: msg.content };
    });
  }
}
