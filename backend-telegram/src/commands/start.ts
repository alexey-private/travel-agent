import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';
import { STARTER_POOLS, type SuggestionAgent } from '../data/suggestions';
import { getLocale, tFor } from '../i18n/language';

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function buildSuggestionsKeyboard(suggestions: string[], ctx: BotContext): InlineKeyboard {
  ctx.session.suggestions = suggestions;
  const kb = new InlineKeyboard();
  suggestions.forEach((_, i) => kb.text(suggestions[i], `sugg:${i}`).row());
  return kb;
}

export async function getStarterKeyboard(
  agentType: SuggestionAgent,
  ctx: BotContext,
): Promise<InlineKeyboard> {
  const locale = await getLocale(ctx);
  const starters = shuffle(STARTER_POOLS[locale][agentType]).slice(0, 4);
  return buildSuggestionsKeyboard(starters, ctx);
}

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command('start', async (ctx) => {
    const agentType = ctx.session.agentType;
    const t = await tFor(ctx);
    await ctx.reply(
      t('start.welcome', {
        mode: agentType === 'travel' ? t('mode.travel') : t('mode.shopping'),
      }),
      {
        parse_mode: 'HTML',
        reply_markup: await getStarterKeyboard(agentType, ctx),
      },
    );
  });
}
