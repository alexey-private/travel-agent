import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { getStarterKeyboard } from './start';

export function registerAgentTypeCommands(bot: Bot<BotContext>): void {
  bot.command('travel', async (ctx) => {
    ctx.session.agentType = 'travel';
    await ctx.reply(
      '✈️ Switched to <b>Travel Agent</b>.\n\nAsk me about flights, hotels, weather, visas, or pick an example:',
      { parse_mode: 'HTML', reply_markup: getStarterKeyboard('travel', ctx) },
    );
  });

  bot.command('shopping', async (ctx) => {
    ctx.session.agentType = 'shopping';
    await ctx.reply(
      '🛍️ Switched to <b>Shopping Agent</b>.\n\nAsk me to find products, compare prices, or pick an example:',
      { parse_mode: 'HTML', reply_markup: getStarterKeyboard('shopping', ctx) },
    );
  });
}
