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

// Inline keyboard: starter prompt buttons (data = "starter:<text>")
bot.callbackQuery(/^starter:(.+)$/, async (ctx) => {
  const text = ctx.match[1];
  await ctx.answerCallbackQuery();
  // Echo as a user message so the chat history looks natural
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
