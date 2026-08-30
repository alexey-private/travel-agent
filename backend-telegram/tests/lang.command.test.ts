import { Bot, InlineKeyboard } from 'grammy';
import { registerLangCommand } from '../src/commands/lang';
import type { BotContext, SessionData } from '../src/types';

type Handler = (ctx: BotContext) => Promise<void>;

/** Captures the two handlers registerLangCommand installs on the bot. */
function capture(): { command: Handler; callback: Handler } {
  let command: Handler | null = null;
  let callback: Handler | null = null;
  const bot = {
    command: (_name: string, h: Handler) => {
      command = h;
    },
    callbackQuery: (_pattern: RegExp, h: Handler) => {
      callback = h;
    },
  } as unknown as Bot<BotContext>;
  registerLangCommand(bot);
  return { command: command!, callback: callback! };
}

function makeCtx(session: Partial<SessionData> = {}, match?: RegExpMatchArray): BotContext {
  return {
    session: { sessionId: 'tg-42', locale: 'en', ...session },
    match,
    reply: jest.fn().mockResolvedValue({ message_id: 1 }),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
  } as unknown as BotContext;
}

describe('/lang command', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it('registers a command handler and a callback handler', () => {
    const bot = new Bot<BotContext>('123:fake');
    const command = jest.spyOn(bot, 'command');
    const callbackQuery = jest.spyOn(bot, 'callbackQuery');

    registerLangCommand(bot);

    expect(command).toHaveBeenCalledWith('lang', expect.any(Function));
    expect(callbackQuery).toHaveBeenCalledWith(expect.any(RegExp), expect.any(Function));
  });

  it('offers all three locales and ticks the current one', async () => {
    const { command } = capture();
    const ctx = makeCtx({ locale: 'he' });

    await command(ctx);

    const [text, options] = (ctx.reply as jest.Mock).mock.calls[0] as [string, { reply_markup: InlineKeyboard }];
    expect(text).toBe('בחרו שפה:');
    const labels = options.reply_markup.inline_keyboard.flat().map((b) => b.text);
    expect(labels).toEqual(['EN', 'עברית ✓', 'RU']);
  });

  it('stores the picked locale and confirms in that language', async () => {
    const { callback } = capture();
    const ctx = makeCtx({ locale: 'en' }, ['lang:he', 'he'] as unknown as RegExpMatchArray);

    await callback(ctx);

    expect(ctx.session.locale).toBe('he');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('userId=tg-42'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ language: 'he' }) }),
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('השפה שונתה לעברית.');
  });
});
