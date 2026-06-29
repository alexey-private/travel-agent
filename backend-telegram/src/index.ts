import 'dotenv/config';
import { Bot, session } from 'grammy';
import type { BotContext, SessionData } from './types';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3002';

const bot = new Bot<BotContext>(BOT_TOKEN);

bot.use(
  session<SessionData, BotContext>({
    initial: (): SessionData => ({
      sessionId: null,
      conversationId: null,
      agentType: 'travel',
      suggestions: [],
    }),
  }),
);

import { registerStartCommand } from './commands/start';
import { registerAgentTypeCommands } from './commands/agent-type';
import { registerClearCommand } from './commands/clear';
import { registerConnectCommand } from './commands/connect';
import { registerCalendarCommand } from './commands/calendar';
import { registerModeCommand } from './commands/mode';
import { registerChatHandler, handleChatMessage } from './chat.handler';

registerStartCommand(bot);
registerAgentTypeCommands(bot);
registerClearCommand(bot);
registerConnectCommand(bot);
registerCalendarCommand(bot);
registerModeCommand(bot);

// Inline keyboard: suggestion buttons (data = "sugg:<index>")
bot.callbackQuery(/^sugg:(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1], 10);
  const text = ctx.session.suggestions[index];
  if (!text) { await ctx.answerCallbackQuery(); return; }
  await ctx.answerCallbackQuery();
  await ctx.reply(text);
  await handleChatMessage(ctx, text);
});

// Chat handler MUST be last — contains greedy catch-all
registerChatHandler(bot);

bot.catch((err) => {
  console.error('Unhandled bot error:', err.message, err.stack);
});

bot.start({
  onStart: (info) => console.log(`Bot started as @${info.username}`),
});
