import { LLMClient } from '../llm/LLMClient';
import { LLMMessage, LLMStreamEvent, LLMToolResult } from '../llm/types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AgentContext } from './AgentContext';
import { UserMemory } from '../types/memory';
import { AgentEvent } from '../types/agent';

const MAX_ITERATIONS = 10;
const MAX_HISTORY = 20;

export type SystemPromptBuilder = (
  memories: UserMemory[],
  userId?: string,
  taskListName?: string,
  platform?: 'web' | 'telegram',
) => string;

export class BaseAgent {
  constructor(
    private toolRegistry: ToolRegistry,
    private llmClient: LLMClient,
    private buildSystemPrompt: SystemPromptBuilder,
    private ragLabel: string,
  ) {}

  async *run(context: AgentContext): AsyncGenerator<AgentEvent> {
    const tools = this.toolRegistry.getAll().map(t => t.toToolDefinition());
    const systemPrompt = this.buildSystemPrompt(context.memories, context.userId, context.taskListName, context.platform);
    const recentHistory = context.history.slice(-MAX_HISTORY);

    const messages: LLMMessage[] = recentHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const userText = context.ragContext
      ? `Relevant ${this.ragLabel} knowledge:\n${context.ragContext}\n\nUser request: ${context.userMessage}`
      : context.userMessage;

    messages.push({ role: 'user', content: await context.buildUserContent(userText) });

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let stopEvent: Extract<LLMStreamEvent, { type: 'stop' }> | null = null;

      for await (const event of this.llmClient.stream({ system: systemPrompt, tools, messages })) {
        if (event.type === 'text_delta') {
          yield { type: 'text', content: event.text };
        } else if (event.type === 'stop') {
          stopEvent = event;
        }
      }

      if (!stopEvent || stopEvent.reason !== 'tool_use') break;

      messages.push({
        role: 'assistant',
        content: stopEvent.assistantText,
        toolCalls: stopEvent.toolCalls,
      });

      const toolResults: LLMToolResult[] = [];

      for (const toolCall of stopEvent.toolCalls) {
        yield { type: 'tool_start', tool: toolCall.name, input: toolCall.input };
      }

      const results = await Promise.all(
        stopEvent.toolCalls.map(tc => this.handleToolCall(tc.id, tc.name, tc.input)),
      );

      for (let i = 0; i < stopEvent.toolCalls.length; i++) {
        const { result, output, error } = results[i];
        yield { type: 'tool_end', tool: stopEvent.toolCalls[i].name, output, error };
        toolResults.push(result);
      }

      messages.push({ role: 'tool', results: toolResults });
    }

    yield { type: 'done' };
  }

  private async handleToolCall(
    id: string,
    name: string,
    input: unknown,
  ): Promise<{ result: LLMToolResult; output: unknown; error?: string }> {
    try {
      const toolResult = await this.toolRegistry.execute(name, input);

      if (!toolResult.success) {
        const errorMsg = toolResult.error ?? 'Tool execution failed';
        return {
          result: { toolCallId: id, content: errorMsg, isError: true },
          output: null,
          error: errorMsg,
        };
      }

      const outputStr =
        typeof toolResult.data === 'string'
          ? toolResult.data
          : JSON.stringify(toolResult.data);

      return {
        result: { toolCallId: id, content: outputStr },
        output: toolResult.data,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        result: {
          toolCallId: id,
          content: `Error executing tool "${name}": ${errorMsg}`,
          isError: true,
        },
        output: null,
        error: errorMsg,
      };
    }
  }
}
