import type { Bot } from 'grammy';
import type { BotContext } from '../types';

export function registerLocationCommand(bot: Bot<BotContext>): void {
  bot.command('location', async (ctx) => {
    const city = ctx.session.currentCity;
    if (!city) {
      await ctx.reply(
        '📍 No location saved.\n\nShare your location using the 📎 attachment button → <b>Location</b> and I\'ll remember your city.',
        { parse_mode: 'HTML' },
      );
      return;
    }
    await ctx.reply(
      `📍 Your current location is set to <b>${city}</b>.\n\nSend /clearlocation to remove it.`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('clearlocation', async (ctx) => {
    const prev = ctx.session.currentCity;
    ctx.session.currentCity = null;
    await ctx.reply(prev ? `📍 Location cleared (was: ${prev}).` : '📍 No location was set.');
  });
}
