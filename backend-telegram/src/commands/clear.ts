import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { tFor } from '../i18n/language';

export function registerClearCommand(bot: Bot<BotContext>): void {
  bot.command('clear', async (ctx) => {
    // Resolve the language before the sessionId is dropped — afterwards there
    // is no key left to look the stored preference up by.
    const t = await tFor(ctx);
    // Rotate the sessionId so the backend starts a fresh conversation
    ctx.session.sessionId = null;
    await ctx.reply(t('clear.done'));
  });
}
