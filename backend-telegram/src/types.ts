import type { Context, SessionFlavor } from 'grammy';
import type { Locale } from './i18n/config';

export interface SessionData {
  sessionId: string | null;
  conversationId: string | null;
  agentType: 'travel' | 'shopping';
  // Last suggestions from the agent — indexed by "sugg:<i>" callback_data
  suggestions: string[];
  // Reverse-geocoded city from shared location, prepended to agent queries
  currentCity: string | null;
  // Cached copy of the language stored in the backend; null until first read
  locale: Locale | null;
}

export type BotContext = Context & SessionFlavor<SessionData>;
