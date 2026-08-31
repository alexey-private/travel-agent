export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Why a turn ended without an answer.
 *
 * A code and not a sentence. The stream used to carry `err.message` — whatever
 * the model provider, the database driver or a tool had thrown — and the
 * Telegram bot printed it to the user verbatim while the browser, whose event
 * union had no `error` variant at all, parsed it and dropped it on the floor.
 * A code fixes both halves at once: nothing internal reaches a user, and each
 * surface has something it can translate and show. The detail stays in the
 * server log, where whoever runs the server can read it.
 */
export type AgentErrorCode = 'agent_failed' | 'request_timed_out';

export type AgentEvent =
  | { type: 'conversation_id'; conversationId: string }
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; error?: string }
  | { type: 'suggestions'; suggestions: string[] }
  | { type: 'error'; code: AgentErrorCode }
  | { type: 'done' };
