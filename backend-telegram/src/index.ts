import 'dotenv/config';
import { Bot, session } from 'grammy';
import type { BotContext, SessionData } from './types';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

// BACKEND_URL and BACKEND_PUBLIC_URL live in ./config, and are imported from
// there — never re-exported here. Importing this file runs it, and running it
// starts the bot, so a module that only wants a URL must not reach for it here.

const bot = new Bot<BotContext>(BOT_TOKEN);

bot.use(
  session<SessionData, BotContext>({
    initial: (): SessionData => ({
      sessionId: null,
      conversationId: null,
      agentType: 'travel',
      suggestions: [],
      currentCity: null,
      locale: null,
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
import { registerLangCommand } from './commands/lang';
import { registerChatHandler, handleChatMessage } from './chat.handler';
import { startCalendarCron } from './notifier/calendar.cron';
import { LOCALES, DEFAULT_LOCALE } from '@travel-agent/i18n';
import { t } from './i18n/t';
import type { TKey } from './i18n/dictionaries';

registerStartCommand(bot);
registerAgentTypeCommands(bot);
registerClearCommand(bot);
registerConnectCommand(bot);
registerCalendarCommand(bot);
registerTasksCommand(bot);
registerModeCommand(bot);
registerLocationCommand(bot);
registerHistoryCommand(bot);
registerLangCommand(bot);

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

const BOT_COMMAND_KEYS: { command: string; key: TKey }[] = [
  { command: 'start',         key: 'commands.start' },
  { command: 'travel',        key: 'commands.travel' },
  { command: 'shopping',      key: 'commands.shopping' },
  { command: 'mode',          key: 'commands.mode' },
  { command: 'calendar',      key: 'commands.calendar' },
  { command: 'tasks',         key: 'commands.tasks' },
  { command: 'connect',       key: 'commands.connect' },
  { command: 'clear',         key: 'commands.clear' },
  { command: 'location',      key: 'commands.location' },
  { command: 'clearlocation', key: 'commands.clearLocation' },
  { command: 'history',       key: 'commands.history' },
  { command: 'lang',          key: 'commands.lang' },
];

bot.start({
  onStart: async (info) => {
    console.log(`Bot started as @${info.username}`);

    // Telegram scopes the command menu by the CLIENT's language, which is not
    // necessarily the language the user picked in our settings. The menu follows
    // Telegram; the bot's replies follow our stored value. Registering the
    // default set last makes it the fallback for every other client language.
    for (const locale of LOCALES) {
      await bot.api.setMyCommands(
        BOT_COMMAND_KEYS.map(({ command, key }) => ({ command, description: t(locale, key) })),
        { language_code: locale },
      );
    }
    await bot.api.setMyCommands(
      BOT_COMMAND_KEYS.map(({ command, key }) => ({ command, description: t(DEFAULT_LOCALE, key) })),
    );

    console.log('Bot commands registered for', LOCALES.join(', '));
    startCalendarCron(bot.api);
  },
});
