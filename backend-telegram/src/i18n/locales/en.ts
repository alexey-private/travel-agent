import type { PluralForms } from '@travel-agent/i18n';

/**
 * English dictionary — the source of truth for the `Dictionary` type.
 *
 * Keys are flat and namespaced by the surface that renders them: `common.*`,
 * `start.*`, `chat.*`, `commands.*`, `history.*`, `location.*`, `connect.*`,
 * `agent.*`, `mode.*`, `calendar.*`, `tasks.*`, `clear.*`, `lang.*`, `notify.*`.
 *
 * Every value is sent to Telegram with `parse_mode: 'HTML'` where the original
 * literal used it, so `<b>`/`<i>`/`<code>` markup is part of the string and the
 * ampersand in the app name stays escaped as `&amp;`.
 */
export const en = {
  // ── Common ────────────────────────────────────────────────────
  'common.thinking': 'Thinking…',

  // ── /start ────────────────────────────────────────────────────
  'start.welcome':
    'Welcome to <b>Travel &amp; Shopping Agent</b>!\n\n' +
    'Current mode: <b>{mode}</b>\n\n' +
    '<b>Commands:</b>\n' +
    '/travel — switch to Travel Agent\n' +
    '/shopping — switch to Shopping Agent\n' +
    '/mode — show current mode\n' +
    '/calendar — show upcoming events\n' +
    '/tasks — show your task list\n' +
    '/connect — link your Google account\n' +
    '/lang — change language\n' +
    '/clear — reset conversation\n\n' +
    'Or pick a quick example:',

  // ── Chat handler ──────────────────────────────────────────────
  'chat.usingTool': '⚙️ Using <b>{tool}</b>…',
  'chat.failed': 'Sorry, something went wrong: {message}',
  'chat.agentFailed': "Sorry, I couldn't finish that answer. Please try again.",
  'chat.requestTimedOut': 'That took too long and was stopped. Please try again.',
  'chat.noResponse': '(no response)',
  'chat.nextStep': 'What would you like to do next?',
  'chat.backendUnreachable': 'Cannot reach the backend. Make sure backend-langgraph is running.',
  'chat.cannotReachBackend': 'Cannot reach backend: {message}',
  'chat.backendError': 'Backend error {status}: {text}',
  'chat.gettingLocation': '📍 Getting your location…',
  'chat.locationSet':
    '📍 Location set to <b>{city}</b>.\n\n' +
    "I'll include your location in travel queries. Use /clearlocation to remove it.",
  'chat.locationFailed': 'Could not determine your location: {message}',
  'chat.unsupportedFile': 'Unsupported file type: {mimeType}.\nI can read PDF and plain text files.',
  'chat.fileTooLarge': 'File is too large (max {max} MB).',
  'chat.fileDownloadFailed': 'Could not download the file: {message}',
  'chat.photoDownloadFailed': 'Could not download the photo: {message}',
  'chat.voiceNeedsKey': 'Voice messages require OPENAI_API_KEY to be configured.',
  'chat.voiceDownloadFailed': 'Could not download voice message: {message}',
  'chat.voiceTranscribeFailed': 'Could not transcribe the voice message.',
  'chat.voiceTooLong': 'That voice message is too long to transcribe.',
  'chat.voiceTooMany': 'Too many voice messages in a row. Wait a moment and try again.',
  'chat.voiceEmpty': 'Could not understand the voice message.',

  // ── Telegram command menu ─────────────────────────────────────
  'commands.start': 'Show welcome message and quick examples',
  'commands.travel': 'Switch to Travel Agent mode',
  'commands.shopping': 'Switch to Shopping Agent mode',
  'commands.mode': 'Show current agent mode',
  'commands.calendar': 'List upcoming calendar events',
  'commands.tasks': 'List your Google Tasks',
  'commands.connect': 'Link your Google account (Calendar & Tasks)',
  'commands.clear': 'Reset conversation',
  'commands.location': 'Show saved location',
  'commands.clearLocation': 'Clear saved location',
  'commands.history': 'Show last 5 exchanges in this conversation',
  'commands.lang': 'Change the language of the bot',

  // ── /history ──────────────────────────────────────────────────
  'history.loading': '📋 Loading history…',
  'history.none': 'No conversation history yet. Start chatting first!',
  'history.loadFailed': 'Could not load history: {message}',
  'history.empty': 'No messages in this conversation yet.',
  'history.noPairs': 'No complete message pairs found.',
  'history.header': {
    one: '<b>📋 Last {count} exchange:</b>\n',
    other: '<b>📋 Last {count} exchanges:</b>\n',
  } as PluralForms,

  // ── /location, /clearlocation ─────────────────────────────────
  'location.none':
    '📍 No location saved.\n\n' +
    "Share your location using the 📎 attachment button → <b>Location</b> and I'll remember your city.",
  'location.current':
    '📍 Your current location is set to <b>{city}</b>.\n\nSend /clearlocation to remove it.',
  'location.cleared': '📍 Location cleared (was: {city}).',
  'location.nothingToClear': '📍 No location was set.',

  // ── /connect ──────────────────────────────────────────────────
  'connect.needSession':
    'Send any message first so I can create your session, then use /connect again.',
  'connect.link':
    'To enable Google Calendar and Tasks, open this link in your browser:\n\n' +
    '<code>{url}</code>\n\n' +
    'After you approve access, come back here and try /calendar again.\n\n' +
    '<i>This link is personal and expires in a few minutes — do not share it.</i>',
  'connect.notConfigured':
    'Connecting Google is unavailable right now: this bot is not configured to reach the backend securely. Please tell the administrator.',

  // ── /travel, /shopping ────────────────────────────────────────
  'agent.switchedTravel':
    '✈️ Switched to <b>Travel Agent</b>.\n\n' +
    'Ask me about flights, hotels, weather, visas, or pick an example:',
  'agent.switchedShopping':
    '🛍️ Switched to <b>Shopping Agent</b>.\n\n' +
    'Ask me to find products, compare prices, or pick an example:',

  // ── /mode ─────────────────────────────────────────────────────
  'mode.current': 'Current mode: <b>{mode}</b>',
  'mode.session': '\nSession: <code>{sessionId}</code>',
  'mode.travel': '✈️ Travel',
  'mode.shopping': '🛍️ Shopping',

  // ── /calendar, /tasks ─────────────────────────────────────────
  'calendar.initializing': 'Calendar feature is initializing, please try again in a moment.',
  'tasks.initializing': 'Tasks feature is initializing, please try again in a moment.',

  // ── /clear ────────────────────────────────────────────────────
  'clear.done': 'Conversation cleared. Starting fresh!',

  // ── /lang ─────────────────────────────────────────────────────
  'lang.choose': 'Choose your language:',
  'lang.changed': 'Language changed to English.',

  // ── Daily reminder cron ───────────────────────────────────────
  'notify.header': "📅 <b>Tomorrow's reminders:</b>\n",
  'notify.events': '🗓 <b>Events:</b>',
  'notify.tasks': '✅ <b>Tasks due:</b>',
};
