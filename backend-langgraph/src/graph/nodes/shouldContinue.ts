import { END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { AgentStateType } from '../state';

/**
 * Conditional edge function — the "router" in the ReAct loop.
 *
 * After each "reason" node step LangGraph calls this to decide:
 *   - "act"  → the model requested tool calls, execute them
 *   - END    → model produced a final answer, stop the loop
 *
 * This mirrors the manual check in the original TravelAgent:
 *   if (!stopEvent || stopEvent.reason !== 'tool_use') break;
 */
export function shouldContinue(state: AgentStateType): 'act' | typeof END {
  const lastMessage = state.messages.at(-1);

  if (
    lastMessage instanceof AIMessage &&
    lastMessage.tool_calls &&
    lastMessage.tool_calls.length > 0
  ) {
    return 'act';
  }

  return END;
}
