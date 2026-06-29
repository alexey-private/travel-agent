import type { Bot } from 'grammy';
import type { BotContext } from '../types';

let chatDispatch: ((ctx: BotContext, text: string) => Promise<void>) | null = null;

export function setTasksDispatch(fn: (ctx: BotContext, text: string) => Promise<void>): void {
  chatDispatch = fn;
}

export function registerTasksCommand(bot: Bot<BotContext>): void {
  bot.command('tasks', async (ctx) => {
    if (!chatDispatch) {
      await ctx.reply('Tasks feature is initializing, please try again in a moment.');
      return;
    }
    await chatDispatch(ctx, 'List all my tasks');
  });
}
