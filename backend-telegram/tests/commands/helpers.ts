import type { BotContext, SessionData } from '../../src/types';
import type { Bot } from 'grammy';

/**
 * Captures command handlers registered via bot.command().
 * Returns a map of commandName → handler function.
 */
export function captureHandlers(
  registerFn: (bot: Bot<BotContext>) => void,
): Map<string, (ctx: BotContext) => Promise<void>> {
  const handlers = new Map<string, (ctx: BotContext) => Promise<void>>();
  const mockBot = {
    command: (name: string, handler: (ctx: BotContext) => Promise<void>) => {
      handlers.set(name, handler);
    },
  } as unknown as Bot<BotContext>;
  registerFn(mockBot);
  return handlers;
}

export function defaultSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    sessionId: 'tg-42',
    conversationId: null,
    agentType: 'travel',
    suggestions: [],
    currentCity: null,
    // Pre-seeded so getLocale() answers from the session cache. Without it
    // every command test would try to reach a real backend for the language,
    // and would read a real preference whenever one happens to be running.
    locale: 'en',
    ...overrides,
  };
}

export function makeCtx(sessionOverrides: Partial<SessionData> = {}): BotContext {
  const replyMock = jest.fn().mockResolvedValue({ message_id: 1 });
  const editMock = jest.fn().mockResolvedValue(undefined);

  return {
    session: defaultSession(sessionOverrides),
    chat: { id: 100, type: 'private' },
    from: { id: 42, is_bot: false, first_name: 'Test' },
    me: { id: 1, username: 'testbot', is_bot: true, first_name: 'Bot' },
    reply: replyMock,
    api: {
      editMessageText: editMock,
      sendChatAction: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as BotContext;
}
