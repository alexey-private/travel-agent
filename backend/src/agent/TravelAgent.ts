import { LLMClient } from '../llm/LLMClient';
import { LLMMessage, LLMStreamEvent, LLMToolResult } from '../llm/types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AgentContext } from './AgentContext';
import { buildSystemPrompt } from './prompts';
import { AgentEvent } from '../types/agent';

/** Maximum number of Reason→Act→Observe cycles before giving up. */
const MAX_ITERATIONS = 10;
/** Keep only the most recent N history entries to avoid context overflow. */
const MAX_HISTORY = 20;

export class TravelAgent {
  constructor(
    private toolRegistry: ToolRegistry,
    private llmClient: LLMClient,
  ) {}

  /**
   * ReAct loop: Reason → Act → Observe, repeated until the LLM produces a
   * final answer (stop reason "end_turn") or the iteration cap is reached.
   *
   * Implemented as an async generator so each event (text token, tool call,
   * tool result) is yielded immediately to the SSE route for real-time streaming.
   */
  async *run(context: AgentContext): AsyncGenerator<AgentEvent> {
    // Convert registered tools to the provider-agnostic definition format
    // so the LLM knows which tools are available and what arguments they expect.
    const tools = this.toolRegistry.getAll().map(t => t.toToolDefinition());

    // Inject user long-term memories (preferences) into the system prompt
    // so the LLM can personalize the response without re-asking each time.
    const systemPrompt = buildSystemPrompt(context.memories);

    // Truncate history to avoid context overflow on long conversations
    const recentHistory = context.history.slice(-MAX_HISTORY);

    // Build provider-agnostic message history from stored conversation turns.
    // This array grows each iteration as assistant turns and tool results are appended.
    const messages: LLMMessage[] = recentHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Prepend RAG context to the user message when the knowledge base returned
    // relevant chunks, giving the LLM grounded facts before it reasons.
    const userContent = context.ragContext
      ? `Relevant travel knowledge:\n${context.ragContext}\n\nUser request: ${context.userMessage}`
      : context.userMessage;

    messages.push({ role: 'user', content: userContent });

    // ── ReAct loop ────────────────────────────────────────────────────────────
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let stopEvent: Extract<LLMStreamEvent, { type: 'stop' }> | null = null;

      // REASON: stream the LLM response token by token.
      // text_delta events are yielded immediately so the UI can render the
      // assistant's thinking in real time before any tools are called.
      for await (const event of this.llmClient.stream({ system: systemPrompt, tools, messages })) {
        if (event.type === 'text_delta') {
          yield { type: 'text', content: event.text };
        } else if (event.type === 'stop') {
          // Capture the terminal event — it carries stop reason and tool calls.
          stopEvent = event;
        }
      }

      // If the model finished normally (end_turn) or emitted no stop event,
      // the answer is complete — exit the loop.
      if (!stopEvent || stopEvent.reason !== 'tool_use') break;

      // ACT: the model wants to call tools.
      // Save the full assistant turn (text reasoning + requested tool calls)
      // so the next LLM call has the correct conversation context.
      messages.push({
        role: 'assistant',
        content: stopEvent.assistantText,
        toolCalls: stopEvent.toolCalls,
      });

      const toolResults: LLMToolResult[] = [];

      // Notify the UI about every pending tool call upfront so the frontend
      // can show "Searching flights…" spinners before results arrive.
      for (const toolCall of stopEvent.toolCalls) {
        yield { type: 'tool_start', tool: toolCall.name, input: toolCall.input };
      }

      // Execute all requested tool calls in parallel to minimize latency
      // (e.g. weather + currency fetched simultaneously).
      const results = await Promise.all(
        stopEvent.toolCalls.map(tc => this.handleToolCall(tc.id, tc.name, tc.input)),
      );

      // OBSERVE: stream tool results to the UI and collect them for the LLM.
      for (let i = 0; i < stopEvent.toolCalls.length; i++) {
        const { result, output, error } = results[i];
        yield { type: 'tool_end', tool: stopEvent.toolCalls[i].name, output, error };
        toolResults.push(result);
      }

      // Feed all tool results back as a single 'tool' message.
      // The LLM will now reason over the observations and either
      // call more tools or produce a final answer.
      messages.push({ role: 'tool', results: toolResults });
    }
    // ─────────────────────────────────────────────────────────────────────────

    yield { type: 'done' };
  }

  /**
   * Execute a single tool call and normalize the result into the
   * provider-agnostic LLMToolResult shape.
   *
   * Errors (both business-logic failures and thrown exceptions) are returned
   * as isError: true so the LLM can observe the failure and self-correct —
   * e.g. retry with different parameters or explain the issue to the user.
   */
  private async handleToolCall(
    id: string,
    name: string,
    input: unknown,
  ): Promise<{ result: LLMToolResult; output: unknown; error?: string }> {
    try {
      const toolResult = await this.toolRegistry.execute(name, input);

      // Business-logic failure (e.g. API returned an error response)
      if (!toolResult.success) {
        const errorMsg = toolResult.error ?? 'Tool execution failed';
        return {
          result: { toolCallId: id, content: errorMsg, isError: true },
          output: null,
          error: errorMsg,
        };
      }

      // Serialize structured data to a string so the LLM can read it as text.
      const outputStr =
        typeof toolResult.data === 'string'
          ? toolResult.data
          : JSON.stringify(toolResult.data);

      return {
        result: { toolCallId: id, content: outputStr },
        output: toolResult.data,
      };
    } catch (err) {
      // Unexpected exception (network timeout, schema mismatch, etc.)
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
