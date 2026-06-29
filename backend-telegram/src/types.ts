import type { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  sessionId: string | null;
  conversationId: string | null;
  agentType: 'travel' | 'shopping';
  // Last suggestions from the agent — indexed by "sugg:<i>" callback_data
  suggestions: string[];
}

export type BotContext = Context & SessionFlavor<SessionData>;
