import OpenAI from 'openai';
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
 * GPT-4o is used for the main ReAct loop (complex reasoning + tool orchestration),
 * GPT-4o-mini for lightweight single-turn tasks (extraction, classification, suggestions).
 */
const REASONING_MODEL = 'gpt-4o';
const FAST_MODEL = 'gpt-4o-mini';

/**
 * OpenAI implementation of {@link LLMClient}.
 *
 * Translates the provider-agnostic message format into OpenAI's ChatCompletionMessageParam
 * shape on every call, so the rest of the codebase never imports `openai` directly.
 */
export class OpenAILLMClient implements LLMClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async *stream(params: LLMStreamParams): AsyncIterable<LLMStreamEvent> {
    const messages = this.toOpenAIMessages(params.messages);
    const tools = params.tools.map(t => this.toOpenAITool(t));

    // Accumulate tool call chunks by index — OpenAI sends them as deltas
    const toolCallAccumulator: Record<
      number,
      { id: string; name: string; arguments: string }
    > = {};

    let assistantText = '';

    const stream = await this.client.chat.completions.create({
      model: REASONING_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      tools: tools.length > 0 ? tools : undefined,
      messages: [
        { role: 'system', content: params.system },
        ...messages,
      ],
      stream: true,
    });

    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Accumulate text
      if (delta.content) {
        assistantText += delta.content;
        yield { type: 'text_delta', text: delta.content };
      }

      // Accumulate tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallAccumulator[tc.index]) {
            toolCallAccumulator[tc.index] = { id: '', name: '', arguments: '' };
          }
          const acc = toolCallAccumulator[tc.index];
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
    }

    const toolCalls: LLMToolCall[] = Object.values(toolCallAccumulator).map(tc => ({
      id: tc.id,
      name: tc.name,
      input: JSON.parse(tc.arguments || '{}'),
    }));

    const reason =
      finishReason === 'stop'
        ? 'end_turn'
        : finishReason === 'tool_calls'
          ? 'tool_use'
          : 'other';

    yield { type: 'stop', reason, toolCalls, assistantText };
  }

  async complete(params: LLMCompleteParams): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = params.messages;
    const response = await this.client.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: params.maxTokens,
      messages: [
        ...(params.system ? [{ role: 'system' as const, content: params.system }] : []),
        ...messages,
      ],
      stream: false,
    });

    return response.choices[0]?.message?.content ?? '';
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toOpenAITool(tool: LLMToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as unknown as Record<string, unknown>,
      },
    };
  }

  /**
   * Maps the provider-agnostic LLMMessage union to OpenAI's ChatCompletionMessageParam.
   *
   * OpenAI encodes tool calls inside the assistant message's `tool_calls` array and
   * tool results as separate `{ role: 'tool' }` messages — one per call — which differs
   * from Anthropic's approach of bundling all results into a single user turn.
   */
  private toOpenAIMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      // Tool results — one message per result (OpenAI requires tool_call_id per message)
      if (msg.role === 'tool') {
        for (const r of msg.results) {
          result.push({
            role: 'tool',
            tool_call_id: r.toolCallId,
            content: r.content,
          });
        }
        continue;
      }

      // Assistant turn that included tool calls
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          })),
        });
        continue;
      }

      // Plain user or assistant text
      result.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    return result;
  }
}
