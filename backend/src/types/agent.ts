export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentEvent =
  | { type: 'conversation_id'; conversationId: string }
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; error?: string }
  | { type: 'suggestions'; suggestions: string[] }
  | { type: 'done' };
