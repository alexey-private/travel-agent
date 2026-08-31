import { DEFAULT_LOCALE, type Locale } from '@travel-agent/i18n';

/**
 * The only user-facing copy in this package that reaches a person directly —
 * everything else goes through the agent (which translates) or the frontend
 * (which has its own dictionary). Three phrases do not warrant more machinery.
 */
const TITLES: Record<Locale, string> = {
  en: "Tomorrow's reminders",
  he: 'התזכורות של מחר',
  ru: 'Напоминания на завтра',
};

/**
 * Russian is the one language here that needs a plural rule; the object is
 * stateless, so it is built once rather than per notification.
 */
const RU_PLURAL = new Intl.PluralRules('ru');

const OVERFLOW: Record<Locale, (count: number) => string> = {
  en: (n) => `…and ${n} more`,
  he: (n) => `…ועוד ${n}`,
  ru: (n) => {
    const form = RU_PLURAL.select(n);
    const noun = form === 'one' ? 'напоминание' : form === 'few' ? 'напоминания' : 'напоминаний';
    return `…и ещё ${n} ${noun}`;
  },
};

export function notificationTitle(locale: Locale): string {
  return TITLES[locale] ?? TITLES[DEFAULT_LOCALE];
}

export function notificationOverflow(locale: Locale, count: number): string {
  return (OVERFLOW[locale] ?? OVERFLOW[DEFAULT_LOCALE])(count);
}

/**
 * One formatter per locale, built at import like the phrases above: the daily
 * cron formats a time for every event of every subscriber in one pass, and
 * constructing a `DateTimeFormat` costs far more than using one.
 *
 * `hourCycle: 'h23'` pins a 24-hour clock for every locale. Left to its own
 * devices English would render "14:30" as "02:30 PM", changing what existing
 * subscribers already receive; the calendar sends 24-hour times and every
 * language here reads them that way. Separator and digits still come from the
 * locale, which for en, he and ru is the same "HH:MM" in all three.
 */
const TIME_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  en: eventTimeFormat('en'),
  he: eventTimeFormat('he'),
  ru: eventTimeFormat('ru'),
};

function eventTimeFormat(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  });
}

/**
 * Calendar providers hand back times as "HH:MM" — or as free text like "all day".
 * Anything that does not parse is passed through unchanged rather than dropped.
 */
export function formatEventTime(locale: Locale, time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;

  const date = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])));
  return (TIME_FORMATS[locale] ?? TIME_FORMATS[DEFAULT_LOCALE]).format(date);
}
