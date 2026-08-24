import { SystemMessage, ContentBlock } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
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
 */
export function createReasonNode(
  buildSystemPrompt: (state: AgentStateType) => string,
  tools: StructuredToolInterface[],
) {
  // bindTools is optional on BaseChatModel (not all providers support it), but both
  // ChatAnthropic and ChatOpenAI do. The ! non-null assertion is safe here.
  const model = createModel('full', { streaming: true }).bindTools!(tools);

  return async (state: AgentStateType) => {
    // cache_control is an Anthropic extension forwarded as-is; ContentBlock only
    // requires `type: string` and allows arbitrary extra keys, so no cast is needed.
    const sysContent: ContentBlock[] = [{ type: 'text', text: buildSystemPrompt(state), cache_control: { type: 'ephemeral' } }];
    const response = await model.invoke([
      new SystemMessage({ content: sysContent }),
      ...state.messages,
    ]);
    return { messages: [response] };
  };
}
