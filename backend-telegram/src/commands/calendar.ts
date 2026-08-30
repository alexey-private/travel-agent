import type { Bot } from 'grammy';
import type { BotContext } from '../types';
import { tFor } from '../i18n/language';

// Implemented after SSE bridge (Step 3) — delegates to the chat handler
// with a pre-filled query so the agent uses its manage_calendar tool.
let chatDispatch: ((ctx: BotContext, text: string) => Promise<void>) | null = null;

export function setCalendarDispatch(fn: (ctx: BotContext, text: string) => Promise<void>): void {
  chatDispatch = fn;
}

export function registerCalendarCommand(bot: Bot<BotContext>): void {
  bot.command('calendar', async (ctx) => {
    if (!chatDispatch) {
      await ctx.reply((await tFor(ctx))('calendar.initializing'));
      return;
    }
    await chatDispatch(ctx, 'List my upcoming calendar events for the next 7 days');
  });
}
