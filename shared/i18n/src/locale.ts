/**
 * Supported interface / conversation languages.
 *
 * This module is the single definition of the set. It used to be copied into
 * `backend-langgraph/src/i18n/locale.ts`, `backend-telegram/src/i18n/config.ts`
 * and `frontend/src/i18n/config.ts`, which meant three files could drift apart
 * from each other and from the CHECK constraint on
 * `user_service_preferences.language`. Adding a locale is now two edits: this
 * file and a migration.
 */
export type Locale = 'en' | 'he' | 'ru';

export const LOCALES: readonly Locale[] = ['en', 'he', 'ru'] as const;

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'he' ? 'rtl' : 'ltr';
}

/**
 * Shown to the user when they pick a language — in the web switcher and on the
 * bot's `/lang` keyboard. Each label is written in its own script, so it is
 * readable to someone who cannot read the current interface language.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'EN',
  he: 'עברית',
  ru: 'RU',
};

/** English names, used inside LLM system prompts — never shown to the user. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  he: 'Hebrew',
  ru: 'Russian',
};
