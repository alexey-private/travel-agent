/**
 * Supported interface / conversation languages.
 *
 * These three values are duplicated in `frontend/src/i18n/config.ts` and
 * `backend-telegram/src/i18n/config.ts`. The database CHECK constraint on
 * `user_service_preferences.language` is the synchronisation point — adding a
 * locale means editing all three modules and shipping a migration.
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

/** English names, used inside LLM system prompts — never shown to the user. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  he: 'Hebrew',
  ru: 'Russian',
};
