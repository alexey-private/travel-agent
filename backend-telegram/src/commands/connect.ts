import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { BACKEND_PUBLIC_URL } from '../config';
import { signStartLink } from '../backendAuth';
import { tFor } from '../i18n/language';

export function registerConnectCommand(bot: Bot<BotContext>): void {
  bot.command('connect', async (ctx) => {
    const t = await tFor(ctx);
    const sessionId = ctx.session.sessionId;
    if (!sessionId) {
      await ctx.reply(t('connect.needSession'));
      return;
    }
    // The link is followed by a browser, so it carries its proof in the query
    // string rather than in a header: without it the backend refuses to open a
    // consent screen for a `tg-` id, since that id is public.
    const signature = signStartLink(sessionId, 'telegram');
    if (!signature) {
      await ctx.reply(t('connect.notConfigured'));
      return;
    }
    const url =
      `${BACKEND_PUBLIC_URL}/auth/google/start?userId=${encodeURIComponent(sessionId)}&platform=telegram` +
      `&exp=${signature.exp}&sig=${signature.sig}`;
    await ctx.reply(t('connect.link', { url }), { parse_mode: 'HTML' });
  });
}
