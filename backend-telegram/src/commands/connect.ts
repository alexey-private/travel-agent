import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { BACKEND_URL } from '../index';

export function registerConnectCommand(bot: Bot<BotContext>): void {
  bot.command('connect', async (ctx) => {
    const sessionId = ctx.session.sessionId;
    if (!sessionId) {
      await ctx.reply(
        'Send any message first so I can create your session, then use /connect again.',
      );
      return;
    }
    const url = `${BACKEND_URL}/api/auth/google?session_id=${sessionId}`;
    await ctx.reply(
      `Connect your Google account to enable Calendar and Tasks integration:\n\n${url}\n\n` +
      `<i>This link is personal — do not share it.</i>`,
      { parse_mode: 'HTML' },
    );
  });
}
