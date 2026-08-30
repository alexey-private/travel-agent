import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { tFor } from '../i18n/language';

export function registerLocationCommand(bot: Bot<BotContext>): void {
  bot.command('location', async (ctx) => {
    const t = await tFor(ctx);
    const city = ctx.session.currentCity;
    if (!city) {
      await ctx.reply(t('location.none'), { parse_mode: 'HTML' });
      return;
    }
    await ctx.reply(t('location.current', { city }), { parse_mode: 'HTML' });
  });

  bot.command('clearlocation', async (ctx) => {
    const t = await tFor(ctx);
    const prev = ctx.session.currentCity;
    ctx.session.currentCity = null;
    await ctx.reply(prev ? t('location.cleared', { city: prev }) : t('location.nothingToClear'));
  });
}
