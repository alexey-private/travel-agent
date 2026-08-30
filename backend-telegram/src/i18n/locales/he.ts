import type { Dictionary } from '../dictionaries';
import type { PluralForms } from '../types';

/**
 * Hebrew dictionary.
 *
 * Written in logical order, the way it is typed — Telegram does the visual
 * reordering. Brand names, slash commands and env-var names stay in Latin
 * (Google, Telegram, PDF, /clearlocation, OPENAI_API_KEY), because the user
 * either reads them on a Latin UI or retypes them verbatim.
 *
 * Declared as `Dictionary` so the compiler rejects a missing or extra key.
 */
export const he: Dictionary = {
  // ── Common ────────────────────────────────────────────────────
  'common.thinking': 'חושב…',

  // ── /start ────────────────────────────────────────────────────
  'start.welcome':
    'ברוכים הבאים ל־<b>Travel &amp; Shopping Agent</b>!\n\n' +
    'מצב נוכחי: <b>{mode}</b>\n\n' +
    '<b>פקודות:</b>\n' +
    '/travel — מעבר לסוכן נסיעות\n' +
    '/shopping — מעבר לסוכן קניות\n' +
    '/mode — הצגת המצב הנוכחי\n' +
    '/calendar — הצגת אירועים קרובים\n' +
    '/tasks — הצגת רשימת המשימות\n' +
    '/connect — חיבור חשבון Google\n' +
    '/lang — שינוי שפה\n' +
    '/clear — איפוס השיחה\n\n' +
    'או בחרו דוגמה מהירה:',

  // ── Chat handler ──────────────────────────────────────────────
  'chat.usingTool': '⚙️ משתמש ב־<b>{tool}</b>…',
  'chat.failed': 'משהו השתבש: {message}',
  'chat.noResponse': '(אין תשובה)',
  'chat.nextStep': 'מה תרצו לעשות עכשיו?',
  'chat.backendUnreachable': 'אין גישה לשרת. ודאו ש־backend-langgraph פועל.',
  'chat.cannotReachBackend': 'אין גישה לשרת: {message}',
  'chat.backendError': 'שגיאת שרת {status}: {text}',
  'chat.gettingLocation': '📍 מאתר את המיקום שלכם…',
  'chat.locationSet':
    '📍 המיקום נקבע ל־<b>{city}</b>.\n\n' +
    'אצרף את המיקום שלכם לשאילתות נסיעה. לביטול שלחו /clearlocation.',
  'chat.locationFailed': 'לא הצלחתי לקבוע את המיקום שלכם: {message}',
  'chat.unsupportedFile': 'סוג קובץ לא נתמך: {mimeType}.\nאני קורא קובצי PDF וטקסט רגיל.',
  'chat.fileTooLarge': 'הקובץ גדול מדי (עד {max} MB).',
  'chat.fileDownloadFailed': 'לא הצלחתי להוריד את הקובץ: {message}',
  'chat.photoDownloadFailed': 'לא הצלחתי להוריד את התמונה: {message}',
  'chat.voiceNeedsKey': 'הודעות קוליות דורשות הגדרה של OPENAI_API_KEY.',
  'chat.voiceDownloadFailed': 'לא הצלחתי להוריד את ההודעה הקולית: {message}',
  'chat.voiceTranscribeFailed': 'לא הצלחתי לתמלל את ההודעה הקולית.',
  'chat.voiceTooLong': 'ההודעה הקולית ארוכה מדי לתמלול.',
  'chat.voiceTooMany': 'יותר מדי הודעות קוליות ברצף. המתינו רגע ונסו שוב.',
  'chat.voiceEmpty': 'לא הצלחתי להבין את ההודעה הקולית.',

  // ── Telegram command menu ─────────────────────────────────────
  'commands.start': 'הצגת הודעת פתיחה ודוגמאות מהירות',
  'commands.travel': 'מעבר למצב סוכן נסיעות',
  'commands.shopping': 'מעבר למצב סוכן קניות',
  'commands.mode': 'הצגת מצב הסוכן הנוכחי',
  'commands.calendar': 'הצגת אירועים קרובים ביומן',
  'commands.tasks': 'הצגת המשימות שלכם ב־Google Tasks',
  'commands.connect': 'חיבור חשבון Google (יומן ומשימות)',
  'commands.clear': 'איפוס השיחה',
  'commands.location': 'הצגת המיקום השמור',
  'commands.clearLocation': 'מחיקת המיקום השמור',
  'commands.history': 'הצגת 5 חילופי ההודעות האחרונים בשיחה',
  'commands.lang': 'שינוי שפת הבוט',

  // ── /history ──────────────────────────────────────────────────
  'history.loading': '📋 טוען היסטוריה…',
  'history.none': 'אין עדיין היסטוריית שיחה. התחילו לשוחח!',
  'history.loadFailed': 'לא הצלחתי לטעון את ההיסטוריה: {message}',
  'history.empty': 'אין עדיין הודעות בשיחה הזו.',
  'history.noPairs': 'לא נמצאו חילופי הודעות שלמים.',
  'history.header': {
    one: '<b>📋 חילוף ההודעות האחרון:</b>\n',
    other: '<b>📋 {count} חילופי ההודעות האחרונים:</b>\n',
  } as PluralForms,

  // ── /location, /clearlocation ─────────────────────────────────
  'location.none':
    '📍 לא נשמר מיקום.\n\n' +
    'שתפו מיקום דרך כפתור הצירוף 📎 ← <b>מיקום</b> ואזכור את העיר שלכם.',
  'location.current':
    '📍 המיקום הנוכחי שלכם הוא <b>{city}</b>.\n\nשלחו /clearlocation כדי למחוק אותו.',
  'location.cleared': '📍 המיקום נמחק (היה: {city}).',
  'location.nothingToClear': '📍 לא היה מיקום שמור.',

  // ── /connect ──────────────────────────────────────────────────
  'connect.needSession':
    'שלחו הודעה כלשהי כדי שאוכל ליצור לכם סשן, ואז השתמשו שוב ב־/connect.',
  'connect.link':
    'כדי להפעיל את Google Calendar ו־Tasks, פתחו את הקישור הזה בדפדפן:\n\n' +
    '<code>{url}</code>\n\n' +
    'אחרי אישור הגישה חזרו לכאן ונסו שוב /calendar.\n\n' +
    '<i>הקישור אישי ופג תוך כמה דקות — אל תשתפו אותו.</i>',
  'connect.notConfigured':
    'החיבור ל־Google אינו זמין כרגע: הבוט אינו מוגדר לפנות לשרת בצורה מאובטחת. אנא פנו למנהל המערכת.',

  // ── /travel, /shopping ────────────────────────────────────────
  'agent.switchedTravel':
    '✈️ עברתם ל<b>סוכן נסיעות</b>.\n\n' +
    'שאלו אותי על טיסות, מלונות, מזג אוויר וויזות, או בחרו דוגמה:',
  'agent.switchedShopping':
    '🛍️ עברתם ל<b>סוכן קניות</b>.\n\n' +
    'בקשו ממני למצוא מוצרים, להשוות מחירים, או בחרו דוגמה:',

  // ── /mode ─────────────────────────────────────────────────────
  'mode.current': 'מצב נוכחי: <b>{mode}</b>',
  'mode.session': '\nסשן: <code>{sessionId}</code>',
  'mode.travel': '✈️ נסיעות',
  'mode.shopping': '🛍️ קניות',

  // ── /calendar, /tasks ─────────────────────────────────────────
  'calendar.initializing': 'תכונת היומן עדיין מתאתחלת, נסו שוב בעוד רגע.',
  'tasks.initializing': 'תכונת המשימות עדיין מתאתחלת, נסו שוב בעוד רגע.',

  // ── /clear ────────────────────────────────────────────────────
  'clear.done': 'השיחה אופסה. מתחילים מחדש!',

  // ── /lang ─────────────────────────────────────────────────────
  'lang.choose': 'בחרו שפה:',
  'lang.changed': 'השפה שונתה לעברית.',

  // ── Daily reminder cron ───────────────────────────────────────
  'notify.header': '📅 <b>תזכורות למחר:</b>\n',
  'notify.events': '🗓 <b>אירועים:</b>',
  'notify.tasks': '✅ <b>משימות לביצוע:</b>',
};
