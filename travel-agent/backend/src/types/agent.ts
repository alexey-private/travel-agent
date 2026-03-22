export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; error?: string }
  | { type: 'done' };
