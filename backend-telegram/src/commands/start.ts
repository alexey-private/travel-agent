import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';

const TRAVEL_STARTERS = [
  'Find flights from NYC to Tokyo next month',
  'What\'s the weather in Bali in July?',
  'Do I need a visa for Thailand?',
  'Convert 1000 USD to Japanese Yen',
];

const SHOPPING_STARTERS = [
  'Find me a good laptop under $1000',
  'Compare iPhone 16 vs Samsung Galaxy S25',
  'Best wireless headphones in 2025',
  'Add MacBook Pro to my shopping list',
];

export function getStarterKeyboard(agentType: 'travel' | 'shopping'): InlineKeyboard {
  const starters = agentType === 'travel' ? TRAVEL_STARTERS : SHOPPING_STARTERS;
  const kb = new InlineKeyboard();
  for (const prompt of starters) {
    kb.text(prompt, `starter:${prompt}`).row();
  }
  return kb;
}

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command('start', async (ctx) => {
    const agentType = ctx.session.agentType;
    await ctx.reply(
      `Welcome to <b>Travel &amp; Shopping Agent</b>!\n\n` +
      `Current mode: <b>${agentType === 'travel' ? '✈️ Travel' : '🛍️ Shopping'}</b>\n\n` +
      `<b>Commands:</b>\n` +
      `/travel — switch to Travel Agent\n` +
      `/shopping — switch to Shopping Agent\n` +
      `/mode — show current mode\n` +
      `/calendar — show upcoming events\n` +
      `/connect — link your Google account\n` +
      `/clear — reset conversation\n\n` +
      `Or pick a quick example:`,
      {
        parse_mode: 'HTML',
        reply_markup: getStarterKeyboard(agentType),
      },
    );
  });
}
