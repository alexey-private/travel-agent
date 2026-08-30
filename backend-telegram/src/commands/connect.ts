import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { BACKEND_PUBLIC_URL } from '../config';
import { tFor } from '../i18n/language';

export function registerConnectCommand(bot: Bot<BotContext>): void {
  bot.command('connect', async (ctx) => {
    const t = await tFor(ctx);
    const sessionId = ctx.session.sessionId;
    if (!sessionId) {
      await ctx.reply(t('connect.needSession'));
      return;
    }
    const url = `${BACKEND_PUBLIC_URL}/auth/google/start?userId=${encodeURIComponent(sessionId)}&platform=telegram`;
    await ctx.reply(t('connect.link', { url }), { parse_mode: 'HTML' });
  });
}
