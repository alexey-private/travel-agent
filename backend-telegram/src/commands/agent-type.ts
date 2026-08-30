import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { getStarterKeyboard } from './start';
import { tFor } from '../i18n/language';

export function registerAgentTypeCommands(bot: Bot<BotContext>): void {
  bot.command('travel', async (ctx) => {
    ctx.session.agentType = 'travel';
    const t = await tFor(ctx);
    await ctx.reply(t('agent.switchedTravel'), {
      parse_mode: 'HTML',
      reply_markup: await getStarterKeyboard('travel', ctx),
    });
  });

  bot.command('shopping', async (ctx) => {
    ctx.session.agentType = 'shopping';
    const t = await tFor(ctx);
    await ctx.reply(t('agent.switchedShopping'), {
      parse_mode: 'HTML',
      reply_markup: await getStarterKeyboard('shopping', ctx),
    });
  });
}
