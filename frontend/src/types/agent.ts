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
  /** Tool-use steps attached to this assistant message */
  steps?: ToolStep[];
  /** True while the assistant is still streaming */
  streaming?: boolean;
  /** Web sources cited by the agent */
  sources?: { title: string; url: string }[];
  /** Suggested follow-up questions */
  suggestions?: string[];
}
