import { InlineKeyboard, type Bot } from 'grammy';
import { LOCALES, LOCALE_LABELS, isLocale } from '@travel-agent/i18n';
import { getLocale, setLocale, tFor } from '../i18n/language';
import type { BotContext } from '../types';

export function registerLangCommand(bot: Bot<BotContext>): void {
  bot.command('lang', async (ctx) => {
    const current = await getLocale(ctx);
    const t = await tFor(ctx);

    const keyboard = new InlineKeyboard();
    for (const locale of LOCALES) {
      const mark = locale === current ? ' ✓' : '';
      keyboard.text(`${LOCALE_LABELS[locale]}${mark}`, `lang:${locale}`);
    }

    await ctx.reply(t('lang.choose'), { reply_markup: keyboard });
  });

  bot.callbackQuery(/^lang:(en|he|ru)$/, async (ctx) => {
    const next = ctx.match[1];
    if (!isLocale(next)) {
      await ctx.answerCallbackQuery();
      return;
    }

    // Order matters: setLocale updates the session cache first, so tFor binds
    // to the language just picked. `lang.changed` names its own language
    // ("Language changed to English"), which only reads right that way round.
    await setLocale(ctx, next);
    const t = await tFor(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(t('lang.changed'));
  });
}
