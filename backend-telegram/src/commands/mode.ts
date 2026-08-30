import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { tFor } from '../i18n/language';

export function registerModeCommand(bot: Bot<BotContext>): void {
  bot.command('mode', async (ctx) => {
    const { agentType, sessionId } = ctx.session;
    const t = await tFor(ctx);
    const label = agentType === 'travel' ? t('mode.travel') : t('mode.shopping');
    const sid = sessionId ? t('mode.session', { sessionId }) : '';
    await ctx.reply(`${t('mode.current', { mode: label })}${sid}`, { parse_mode: 'HTML' });
  });
}
