import { SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentStateType } from '../state';
import { createModel } from '../../llm/createModel';

/**
 * Creates the "reason" node for a LangGraph ReAct agent.
 *
 * Invokes the model with the current message history prepended by the system prompt.
 * LangGraph's messagesStateReducer appends the response to state.messages automatically.
 *
 * The model is created once per graph build (per request) with tools bound.
 * streaming: true ensures on_chat_model_stream events are emitted by streamEvents().
 *
 * bindTools() returns a Runnable with looser TS types — cast to avoid false TS2722.
 */
export function createReasonNode(systemPrompt: string, tools: DynamicStructuredTool[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (createModel('full', { streaming: true }) as any).bindTools(tools);

  return async (state: AgentStateType) => {
    const response = await model.invoke([new SystemMessage(systemPrompt), ...state.messages]);
    return { messages: [response] };
  };
}
