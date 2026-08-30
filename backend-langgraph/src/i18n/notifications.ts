import { DEFAULT_LOCALE, type Locale } from './locale';

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

const OVERFLOW: Record<Locale, (count: number) => string> = {
  en: (n) => `…and ${n} more`,
  he: (n) => `…ועוד ${n}`,
  ru: (n) => {
    const form = new Intl.PluralRules('ru').select(n);
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
 * Calendar providers hand back times as "HH:MM" — or as free text like "all day".
 * Anything that does not parse is passed through unchanged rather than dropped.
 *
 * `hourCycle: 'h23'` pins a 24-hour clock for every locale. Left to its own
 * devices English would render "14:30" as "02:30 PM", changing what existing
 * subscribers already receive; the calendar sends 24-hour times and every
 * language here reads them that way.
 *
 * Separator and digits still come from the locale, which for en, he and ru is
 * the same "HH:MM" in all three.
 */
export function formatEventTime(locale: Locale, time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;

  const date = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(date);
}
