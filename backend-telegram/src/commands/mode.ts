import type { Bot } from 'grammy';
import type { BotContext } from '../types';

export function registerModeCommand(bot: Bot<BotContext>): void {
  bot.command('mode', async (ctx) => {
    const { agentType, sessionId } = ctx.session;
    const label = agentType === 'travel' ? '✈️ Travel' : '🛍️ Shopping';
    const sid = sessionId ? `\nSession: <code>${sessionId}</code>` : '';
    await ctx.reply(`Current mode: <b>${label}</b>${sid}`, { parse_mode: 'HTML' });
  });
}
