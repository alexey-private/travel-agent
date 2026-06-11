import { SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentStateType } from '../state';
import { createModel } from '../../llm/createModel';

/**
 * Creates the "reason" node for a LangGraph ReAct agent.
 *
 * Accepts a prompt builder instead of a static string so that per-request
 * context (memories, sessionId, taskListName) can be read from state at
 * invocation time. This lets the compiled graph be a singleton while still
 * producing a personalised system prompt for every request.
 *
 * The model is created once in the closure (per graph build / per singleton
 * init) with tools bound. streaming: true ensures on_chat_model_stream events
 * are emitted by streamEvents().
 *
 * bindTools() returns a Runnable with looser TS types — cast to avoid TS2722.
 */
export function createReasonNode(
  buildSystemPrompt: (state: AgentStateType) => string,
  tools: DynamicStructuredTool[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (createModel('full', { streaming: true }) as any).bindTools(tools);

  return async (state: AgentStateType) => {
    // cache_control marks the system prompt for Anthropic prompt caching (~5 min TTL).
    // The field is not in LangChain core types but is forwarded to the Anthropic API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sysContent: any = [{ type: 'text', text: buildSystemPrompt(state), cache_control: { type: 'ephemeral' } }];
    const response = await model.invoke([
      new SystemMessage({ content: sysContent }),
      ...state.messages,
    ]);
    return { messages: [response] };
  };
}
