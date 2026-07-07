import 'dotenv/config';
import { Bot, session } from 'grammy';
import type { BotContext, SessionData } from './types';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3002';

// Separate from BACKEND_URL: that one is a private-network address the bot's
// own server-to-server fetch calls use, which is unreachable from a user's
// browser (e.g. Railway's `*.railway.internal`). Links sent to the user
// (like /connect's OAuth link) must use a publicly reachable URL instead.
export const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL ?? BACKEND_URL;

const bot = new Bot<BotContext>(BOT_TOKEN);

bot.use(
  session<SessionData, BotContext>({
    initial: (): SessionData => ({
      sessionId: null,
      conversationId: null,
      agentType: 'travel',
      suggestions: [],
      currentCity: null,
    }),
  }),
);

import { registerStartCommand } from './commands/start';
import { registerAgentTypeCommands } from './commands/agent-type';
import { registerClearCommand } from './commands/clear';
import { registerConnectCommand } from './commands/connect';
import { registerCalendarCommand } from './commands/calendar';
import { registerTasksCommand } from './commands/tasks';
import { registerModeCommand } from './commands/mode';
import { registerLocationCommand } from './commands/location';
import { registerHistoryCommand } from './commands/history';
import { registerChatHandler, handleChatMessage } from './chat.handler';
import { startCalendarCron } from './notifier/calendar.cron';

registerStartCommand(bot);
registerAgentTypeCommands(bot);
registerClearCommand(bot);
registerConnectCommand(bot);
registerCalendarCommand(bot);
registerTasksCommand(bot);
registerModeCommand(bot);
registerLocationCommand(bot);
registerHistoryCommand(bot);

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

const BOT_COMMANDS = [
  { command: 'start',    description: 'Show welcome message and quick examples' },
  { command: 'travel',   description: 'Switch to Travel Agent mode' },
  { command: 'shopping', description: 'Switch to Shopping Agent mode' },
  { command: 'mode',     description: 'Show current agent mode' },
  { command: 'calendar', description: 'List upcoming calendar events' },
  { command: 'tasks',    description: 'List your Google Tasks' },
  { command: 'connect',  description: 'Link your Google account (Calendar & Tasks)' },
  { command: 'clear',       description: 'Reset conversation' },
  { command: 'location',    description: 'Show saved location' },
  { command: 'clearlocation', description: 'Clear saved location' },
  { command: 'history',       description: 'Show last 5 exchanges in this conversation' },
];

bot.start({
  onStart: async (info) => {
    console.log(`Bot started as @${info.username}`);
    await bot.api.setMyCommands(BOT_COMMANDS);
    console.log('Bot commands registered');
    startCalendarCron(bot.api);
  },
});
