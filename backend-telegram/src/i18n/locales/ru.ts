import type { Dictionary } from '../dictionaries';
import type { PluralForms } from '../types';

/**
 * Russian dictionary.
 *
 * Brand names, slash commands and env-var names stay in Latin (Google,
 * Telegram, PDF, /clearlocation, OPENAI_API_KEY). Entries with `{count}` carry
 * all the forms Russian needs — one/few/many — because Intl.PluralRules picks
 * `few` for 2–4 and `many` for 5 and up.
 *
 * Declared as `Dictionary` so the compiler rejects a missing or extra key.
 */
export const ru: Dictionary = {
  // ── Common ────────────────────────────────────────────────────
  'common.thinking': 'Думаю…',

  // ── /start ────────────────────────────────────────────────────
  'start.welcome':
    'Добро пожаловать в <b>Travel &amp; Shopping Agent</b>!\n\n' +
    'Текущий режим: <b>{mode}</b>\n\n' +
    '<b>Команды:</b>\n' +
    '/travel — переключиться на турагента\n' +
    '/shopping — переключиться на шопинг-агента\n' +
    '/mode — показать текущий режим\n' +
    '/calendar — показать ближайшие события\n' +
    '/tasks — показать список задач\n' +
    '/connect — подключить аккаунт Google\n' +
    '/lang — сменить язык\n' +
    '/clear — сбросить диалог\n\n' +
    'Или выберите быстрый пример:',

  // ── Chat handler ──────────────────────────────────────────────
  'chat.usingTool': '⚙️ Использую <b>{tool}</b>…',
  'chat.failed': 'Что-то пошло не так: {message}',
  'chat.noResponse': '(нет ответа)',
  'chat.nextStep': 'Что хотите сделать дальше?',
  'chat.backendUnreachable': 'Не могу связаться с сервером. Убедитесь, что backend-langgraph запущен.',
  'chat.cannotReachBackend': 'Не могу связаться с сервером: {message}',
  'chat.backendError': 'Ошибка сервера {status}: {text}',
  'chat.gettingLocation': '📍 Определяю ваше местоположение…',
  'chat.locationSet':
    '📍 Местоположение установлено: <b>{city}</b>.\n\n' +
    'Буду учитывать его в вопросах о поездках. Чтобы убрать, отправьте /clearlocation.',
  'chat.locationFailed': 'Не удалось определить ваше местоположение: {message}',
  'chat.unsupportedFile':
    'Неподдерживаемый тип файла: {mimeType}.\nЯ читаю PDF и обычный текст.',
  'chat.fileTooLarge': 'Файл слишком большой (максимум {max} МБ).',
  'chat.fileDownloadFailed': 'Не удалось скачать файл: {message}',
  'chat.photoDownloadFailed': 'Не удалось скачать фото: {message}',
  'chat.voiceNeedsKey': 'Для голосовых сообщений нужно настроить OPENAI_API_KEY.',
  'chat.voiceDownloadFailed': 'Не удалось скачать голосовое сообщение: {message}',
  'chat.voiceTranscribeFailed': 'Не удалось расшифровать голосовое сообщение: {message}',
  'chat.voiceEmpty': 'Не удалось разобрать голосовое сообщение.',

  // ── Telegram command menu ─────────────────────────────────────
  'commands.start': 'Показать приветствие и быстрые примеры',
  'commands.travel': 'Переключиться в режим турагента',
  'commands.shopping': 'Переключиться в режим шопинг-агента',
  'commands.mode': 'Показать текущий режим агента',
  'commands.calendar': 'Показать ближайшие события календаря',
  'commands.tasks': 'Показать ваши задачи в Google Tasks',
  'commands.connect': 'Подключить аккаунт Google (Календарь и Задачи)',
  'commands.clear': 'Сбросить диалог',
  'commands.location': 'Показать сохранённое местоположение',
  'commands.clearLocation': 'Удалить сохранённое местоположение',
  'commands.history': 'Показать последние 5 обменов в этом диалоге',
  'commands.lang': 'Сменить язык бота',

  // ── /history ──────────────────────────────────────────────────
  'history.loading': '📋 Загружаю историю…',
  'history.none': 'Истории диалога пока нет. Напишите что-нибудь!',
  'history.loadFailed': 'Не удалось загрузить историю: {message}',
  'history.empty': 'В этом диалоге пока нет сообщений.',
  'history.noPairs': 'Полных пар сообщений не найдено.',
  'history.header': {
    one: '<b>📋 Последний обмен сообщениями:</b>\n',
    few: '<b>📋 Последние {count} обмена сообщениями:</b>\n',
    many: '<b>📋 Последние {count} обменов сообщениями:</b>\n',
    other: '<b>📋 Последние {count} обмена сообщениями:</b>\n',
  } as PluralForms,

  // ── /location, /clearlocation ─────────────────────────────────
  'location.none':
    '📍 Местоположение не сохранено.\n\n' +
    'Поделитесь им через кнопку вложения 📎 → <b>Геопозиция</b>, и я запомню ваш город.',
  'location.current':
    '📍 Ваше текущее местоположение: <b>{city}</b>.\n\nОтправьте /clearlocation, чтобы удалить его.',
  'location.cleared': '📍 Местоположение удалено (было: {city}).',
  'location.nothingToClear': '📍 Местоположение не было сохранено.',

  // ── /connect ──────────────────────────────────────────────────
  'connect.needSession':
    'Сначала отправьте любое сообщение, чтобы я создал вашу сессию, затем используйте /connect снова.',
  'connect.link':
    'Чтобы включить Google Calendar и Tasks, откройте эту ссылку в браузере:\n\n' +
    '<code>{url}</code>\n\n' +
    'После подтверждения доступа вернитесь сюда и попробуйте /calendar снова.\n\n' +
    '<i>Ссылка личная — не делитесь ею.</i>',

  // ── /travel, /shopping ────────────────────────────────────────
  'agent.switchedTravel':
    '✈️ Переключился на <b>турагента</b>.\n\n' +
    'Спрашивайте про рейсы, отели, погоду и визы — или выберите пример:',
  'agent.switchedShopping':
    '🛍️ Переключился на <b>шопинг-агента</b>.\n\n' +
    'Попросите найти товары или сравнить цены — или выберите пример:',

  // ── /mode ─────────────────────────────────────────────────────
  'mode.current': 'Текущий режим: <b>{mode}</b>',
  'mode.session': '\nСессия: <code>{sessionId}</code>',
  'mode.travel': '✈️ Путешествия',
  'mode.shopping': '🛍️ Покупки',

  // ── /calendar, /tasks ─────────────────────────────────────────
  'calendar.initializing': 'Календарь ещё запускается, попробуйте через мгновение.',
  'tasks.initializing': 'Задачи ещё запускаются, попробуйте через мгновение.',

  // ── /clear ────────────────────────────────────────────────────
  'clear.done': 'Диалог сброшен. Начинаем заново!',

  // ── /lang ─────────────────────────────────────────────────────
  'lang.choose': 'Выберите язык:',
  'lang.changed': 'Язык изменён на русский.',

  // ── Daily reminder cron ───────────────────────────────────────
  'notify.header': '📅 <b>Напоминания на завтра:</b>\n',
  'notify.events': '🗓 <b>События:</b>',
  'notify.tasks': '✅ <b>Задачи на срок:</b>',
};
