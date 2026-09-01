import { SystemMessage, ContentBlock } from '@langchain/core/messages';
import { mergeConfigs, type RunnableConfig } from '@langchain/core/runnables';
import { StructuredToolInterface } from '@langchain/core/tools';
import { AgentStateType } from '../state';
import { createModel, type Provider } from '../../llm/createModel';
import { createModelPair } from '../../llm/modelPair';
import { withProviderFallback } from '../../llm/providerFallback';

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
 * When the active provider fails, the same call is retried on the standby one —
 * see providerFallback.ts for the policy. The two rules this node contributes to
 * it are that an abort never diverts, and that an answer which has already put a
 * token on the wire never diverts either: the frontend appends text, so a second
 * attempt would paste a whole answer onto the tail of a truncated one.
 *
 * The prompt itself is built per attempt, because its shape belongs to the
 * provider answering it — see systemMessageFor below.
 */
export function createReasonNode(
  buildSystemPrompt: (state: AgentStateType) => string,
  tools: StructuredToolInterface[],
) {
  // One recipe for both providers — see modelPair.ts for why the standby is built
  // from it lazily rather than declared beside the primary.
  //
  // bindTools is optional on BaseChatModel (not all providers support it), but both
  // ChatAnthropic and ChatOpenAI do. The ! non-null assertion is safe here.
  const modelFor = createModelPair(provider =>
    createModel('full', { streaming: true }, provider).bindTools!(tools),
  );

  return async (state: AgentStateType, config?: RunnableConfig) => {
    // One prompt, two shapes. cache_control is an Anthropic extension, and it used
    // to ride along to the standby on the evidence that ChatOpenAI tolerated the
    // unknown key. It tolerates it only under role "system" — which is what
    // @langchain/openai uses for gpt-4o and not for gpt-5.x, where a developer-role
    // content block is validated strictly:
    //   400 Unknown parameter: 'messages[0].content[0].cache_control'
    // So the ride-along silently pinned the standby to the gpt-4 family, and
    // nothing failed until Anthropic was already down. Anthropic gets the cached
    // block; anyone else gets the same text with no vendor keys on it. An
    // allowlist and not `!== 'openai'`: a third provider must default to the
    // portable shape rather than inherit another vendor's extension.
    //
    // ContentBlock requires only `type: string` and allows extra keys, so the
    // cache_control block needs no cast.
    const systemPrompt = buildSystemPrompt(state);
    const systemMessageFor = (provider: Provider) => {
      if (provider !== 'anthropic') return new SystemMessage(systemPrompt);
      const content: ContentBlock[] = [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ];
      return new SystemMessage({ content });
    };

    // Per invocation, not per node: the model is a singleton shared by concurrent
    // requests, so a flag anywhere outside this closure would let one user's
    // stream veto another user's retry. It needs no reset between the two
    // attempts of one request — the standby is only ever tried when the veto
    // said false, and a reset here would mask a flag that had wrongly been
    // hoisted out of this closure.
    let streamed = false;

    const response = await withProviderFallback(
      async (provider) => {
        // mergeConfigs ADDS to the callback manager LangGraph handed us.
        // ensureConfig assigns `callbacks` wholesale, which would detach this run
        // from streamEvents — every test still green, and no text reaching the
        // browser.
        const cfg = mergeConfigs(config, {
          callbacks: [{ handleLLMNewToken: () => { streamed = true; } }],
        });
        return modelFor(provider).invoke([systemMessageFor(provider), ...state.messages], cfg);
      },
      {
        context: 'reasonNode',
        signal: config?.signal,
        isUnrecoverablyPartial: () => streamed,
      },
    );

    return { messages: [response] };
  };
}
