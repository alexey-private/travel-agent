import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { BACKEND_PUBLIC_URL } from '../index';

export function registerConnectCommand(bot: Bot<BotContext>): void {
  bot.command('connect', async (ctx) => {
    const sessionId = ctx.session.sessionId;
    if (!sessionId) {
      await ctx.reply(
        'Send any message first so I can create your session, then use /connect again.',
      );
      return;
    }
    const url = `${BACKEND_PUBLIC_URL}/auth/google/start?userId=${encodeURIComponent(sessionId)}&platform=telegram`;
    await ctx.reply(
      `To enable Google Calendar and Tasks, open this link in your browser:\n\n<code>${url}</code>\n\n` +
      `After you approve access, come back here and try /calendar again.\n\n` +
      `<i>This link is personal — do not share it.</i>`,
      { parse_mode: 'HTML' },
    );
  });
}
