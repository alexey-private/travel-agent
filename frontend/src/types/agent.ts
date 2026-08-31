export interface Attachment {
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

export type AgentEvent =
  | { type: "conversation_id"; conversationId: string }
  | { type: "text"; content: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; tool: string; output: unknown; error?: string }
  | { type: "sources"; sources: { title: string; url: string }[] }
  | { type: "suggestions"; suggestions: string[] }
  // Why the turn ended without an answer. A code, not a sentence: the backend
  // writes no internal text to the wire, and this end translates it. The union
  // had no `error` variant at all, so the browser parsed the event and dropped
  // it, and the bubble simply stopped, empty.
  | { type: "error"; code?: string }
  | { type: "done" };

export interface Conversation {
  id: string;
  created_at: string;
  title: string | null;
}

export interface UserMemory {
  key: string;
  value: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  agent_steps?: AgentEvent[] | null;
  created_at?: string;
}

export interface ToolStep {
  id: string;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
  /** true while waiting for the tool_end event */
  pending: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  /** Tool-use steps attached to this assistant message */
  steps?: ToolStep[];
  /** True while the assistant is still streaming */
  streaming?: boolean;
  /** Web sources cited by the agent */
  sources?: { title: string; url: string }[];
  /** Suggested follow-up questions */
  suggestions?: string[];
}

export type MessagesAction =
  | { type: "RESET"; messages: Message[] }
  | { type: "ADD"; message: Message }
  | { type: "STREAM_TEXT"; id: string; chunk: string }
  | { type: "TOOL_START"; id: string; tool: string; input: unknown }
  | { type: "TOOL_END"; id: string; tool: string; output: unknown; error?: string }
  | { type: "SET_SOURCES"; id: string; sources: { title: string; url: string }[] }
  | { type: "SET_SUGGESTIONS"; id: string; suggestions: string[] }
  | { type: "MARK_DONE"; id: string }
  | { type: "MARK_ERROR"; id: string; error: string };
