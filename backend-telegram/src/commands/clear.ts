import type { Bot } from 'grammy';
import type { BotContext } from '../types';

export function registerClearCommand(bot: Bot<BotContext>): void {
  bot.command('clear', async (ctx) => {
    // Rotate the sessionId so the backend starts a fresh conversation
    ctx.session.sessionId = null;
    await ctx.reply('Conversation cleared. Starting fresh!');
  });
}
