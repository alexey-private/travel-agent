import { END } from '@langchain/langgraph';
import { AgentStateType } from '../state';

/**
 * Conditional edge function — the "router" in the ReAct loop.
 *
 * After each "reason" node step LangGraph calls this to decide:
 *   - "act"  → the model requested tool calls, execute them
 *   - END    → model produced a final answer, stop the loop
 *
 * We check tool_calls without strict instanceof because LangChain streaming
 * returns AIMessageChunk (not AIMessage) when the model is invoked via
 * model.invoke() with streaming: true. Both types share the tool_calls field.
 */
export function shouldContinue(state: AgentStateType): 'act' | typeof END {
  const lastMessage = state.messages.at(-1);

  // Duck-type check: AIMessage and AIMessageChunk both expose tool_calls
  const toolCalls = (lastMessage as { tool_calls?: unknown[] })?.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return 'act';
  }

  return END;
}
