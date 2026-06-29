import type { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  sessionId: string | null;
  conversationId: string | null;
  agentType: 'travel' | 'shopping';
  // Last suggestions from the agent — indexed by "sugg:<i>" callback_data
  suggestions: string[];
  // Reverse-geocoded city from shared location, prepended to agent queries
  currentCity: string | null;
}

export type BotContext = Context & SessionFlavor<SessionData>;
