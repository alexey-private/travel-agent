import Anthropic from '@anthropic-ai/sdk';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AgentContext } from './AgentContext';
import { buildSystemPrompt } from './prompts';
import { AgentEvent } from '../types/agent';

const MAX_ITERATIONS = 10;
/** Keep only the most recent N history entries to avoid context overflow. */
const MAX_HISTORY = 20;
const MODEL = 'claude-sonnet-4-6';

export class TravelAgent {
  constructor(
    private toolRegistry: ToolRegistry,
    private anthropic: Anthropic,
  ) {}

  async *run(context: AgentContext): AsyncGenerator<AgentEvent> {
    const tools = this.toolRegistry.getAll().map(t => t.toAnthropicTool());
    const systemPrompt = buildSystemPrompt(context.memories);

    // Truncate history to avoid context overflow on long conversations
    const recentHistory = context.history.slice(-MAX_HISTORY);

    // Build message history
    const messages: Anthropic.MessageParam[] = recentHistory.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Add user message, prepending RAG context if available
    const userContent = context.ragContext
      ? `Relevant travel knowledge:\n${context.ragContext}\n\nUser request: ${context.userMessage}`
      : context.userMessage;

    messages.push({ role: 'user', content: userContent });

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Stream text tokens in real time while waiting for the full response
      const stream = this.anthropic.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        messages,
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta' &&
          chunk.delta.text
        ) {
          yield { type: 'text', content: chunk.delta.text };
        }
      }

      const response = await stream.finalMessage();

      if (response.stop_reason === 'end_turn') {
        break;
      }

      if (response.stop_reason === 'tool_use') {
        // Append assistant turn before processing tool calls
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            yield { type: 'tool_start', tool: block.name, input: block.input };

            const { result, output, error } = await this.handleToolCall(block);

            yield { type: 'tool_end', tool: block.name, output, error };

            toolResults.push(result);
          }
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Any other stop reason (max_tokens, stop_sequence, etc.) — stop loop
      break;
    }

    yield { type: 'done' };
  }

  private async handleToolCall(toolUse: Anthropic.ToolUseBlock): Promise<{
    result: Anthropic.ToolResultBlockParam;
    output: unknown;
    error?: string;
  }> {
    try {
      const toolResult = await this.toolRegistry.execute(toolUse.name, toolUse.input);

      if (!toolResult.success) {
        const errorMsg = toolResult.error ?? 'Tool execution failed';
        return {
          result: {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: errorMsg,
            is_error: true,
          },
          output: null,
          error: errorMsg,
        };
      }

      const outputStr =
        typeof toolResult.data === 'string'
          ? toolResult.data
          : JSON.stringify(toolResult.data);

      return {
        result: {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: outputStr,
        },
        output: toolResult.data,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        result: {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error executing tool "${toolUse.name}": ${errorMsg}`,
          is_error: true,
        },
        output: null,
        error: errorMsg,
      };
    }
  }
}
