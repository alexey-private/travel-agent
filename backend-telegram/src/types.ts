import type { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  sessionId: string | null;
  conversationId: string | null;
  agentType: 'travel' | 'shopping';
}

export type BotContext = Context & SessionFlavor<SessionData>;
