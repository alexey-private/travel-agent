import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { UserMemory } from '../types/memory';
import { Locale, DEFAULT_LOCALE } from '../i18n/locale';

/**
 * Shared state for both Travel and Shopping LangGraph agents.
 *
 * LangGraph passes this state between nodes on every graph step.
 *
 * Fields WITHOUT a reducer use LastValue semantics (last write wins).
 * This is correct for metadata set once at graph entry: sessionId, agentType, etc.
 *
 * `messages` uses messagesStateReducer — appends new messages each step,
 * which is the core mechanism behind the ReAct loop.
 */
export const AgentState = Annotation.Root({
  // Accumulated conversation messages — appended on every graph step.
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Per-request metadata (LastValue — set once, read-only throughout the graph).
  userId: Annotation<string>(),
  conversationId: Annotation<string>(),
  agentType: Annotation<'travel' | 'shopping'>(),

  // User long-term memories injected into the system prompt.
  memories: Annotation<UserMemory[]>(),

  // RAG context prepended to the first user message (null = no RAG needed).
  ragContext: Annotation<string | null>(),

  /** User-specific task list name, injected into the system prompt. */
  taskListName: Annotation<string>(),

  /** Client platform — controls response formatting in the system prompt. */
  platform: Annotation<'web' | 'telegram' | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),

  /**
   * User's language — controls the response language in the system prompt.
   *
   * Defaulted rather than left undefined: a graph entered without a language
   * still has to produce a prompt, and English is the answer every other layer
   * falls back to.
   */
  language: Annotation<Locale>({
    default: () => DEFAULT_LOCALE,
    reducer: (_, next) => next,
  }),
});

export type AgentStateType = typeof AgentState.State;
