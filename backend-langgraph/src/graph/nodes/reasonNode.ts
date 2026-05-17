import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Runnable } from '@langchain/core/runnables';
import { AgentStateType } from '../state';
import { env } from '../../config/env';

/**
 * Factory: returns a model bound to the given tools.
 *
 * Using claude-sonnet-4-6 for the main reasoning loop (same as the original backend)
 * and gpt-4o for OpenAI parity.
 *
 * bindTools() returns a Runnable, not BaseChatModel, so we type it as Runnable.
 */
function createBoundModel(tools: DynamicStructuredTool[]): Runnable {
  if (env.LLM_PROVIDER === 'openai') {
    return new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: env.OPENAI_API_KEY,
      streaming: true,
    }).bindTools(tools);
  }

  return new ChatAnthropic({
    model: 'claude-sonnet-4-6',
    apiKey: env.ANTHROPIC_API_KEY,
    streaming: true,
  }).bindTools(tools);
}

/**
 * Creates the "reason" node for a LangGraph agent.
 *
 * The node receives the current graph state (which includes the accumulated
 * message history) and returns the model's next response as a new message.
 * LangGraph appends it to state.messages via the messagesStateReducer.
 *
 * The system prompt (with injected user memories) is prepended on every call
 * so the model always has personalization context.
 *
 * @param systemPrompt - Pre-built system prompt string (with memories injected)
 * @param tools - Wrapped LangChain tools available to this agent
 */
export function createReasonNode(systemPrompt: string, tools: DynamicStructuredTool[]) {
  const model = createBoundModel(tools);

  return async (state: AgentStateType) => {
    const systemMessage = new SystemMessage(systemPrompt);
    const response = await model.invoke([systemMessage, ...state.messages]);
    // Return just the new message — LangGraph reducer appends it to state.messages
    return { messages: [response] };
  };
}
