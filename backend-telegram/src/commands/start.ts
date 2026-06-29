import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';

const TRAVEL_POOL = [
  'Find flights from NYC to Tokyo next month',
  "What's the weather in Bali in July?",
  'Do I need a visa for Thailand?',
  'Convert 1000 USD to Japanese Yen',
  'Best hotels in Paris under €150/night',
  'Search car rentals in Rome for next week',
  'Plan a 7-day trip to Japan',
  'What currency does Vietnam use?',
  'Find guided tours in Barcelona',
  'Check visa requirements for India',
];

const SHOPPING_POOL = [
  'Find me a good laptop under $1000',
  'Compare iPhone 16 vs Samsung Galaxy S25',
  'Best wireless headphones in 2025',
  'Add MacBook Pro to my shopping list',
  'Find deals on Sony cameras',
  'Compare prices for iPad Pro',
  'Best budget mechanical keyboard',
  'Find a 4K monitor under $400',
  'Search deals on running shoes',
  'Compare AirPods Pro vs Sony WF-1000XM5',
];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function buildSuggestionsKeyboard(suggestions: string[], ctx: BotContext): InlineKeyboard {
  ctx.session.suggestions = suggestions;
  const kb = new InlineKeyboard();
  suggestions.forEach((_, i) => kb.text(suggestions[i], `sugg:${i}`).row());
  return kb;
}

export function getStarterKeyboard(agentType: 'travel' | 'shopping', ctx: BotContext): InlineKeyboard {
  const pool = agentType === 'travel' ? TRAVEL_POOL : SHOPPING_POOL;
  const starters = shuffle(pool).slice(0, 4);
  return buildSuggestionsKeyboard(starters, ctx);
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
      `/tasks — show your task list\n` +
      `/connect — link your Google account\n` +
      `/clear — reset conversation\n\n` +
      `Or pick a quick example:`,
      {
        parse_mode: 'HTML',
        reply_markup: getStarterKeyboard(agentType, ctx),
      },
    );
  });
}
