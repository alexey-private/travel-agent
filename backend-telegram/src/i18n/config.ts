/**
 * Supported bot languages.
 *
 * These three values are mirrored in `backend-langgraph/src/i18n/locale.ts` and
 * `frontend/src/i18n/config.ts`, and enforced by the CHECK constraint on
 * `user_service_preferences.language`. Adding a locale means touching all four.
 */
export type Locale = 'en' | 'he' | 'ru';

export const LOCALES: readonly Locale[] = ['en', 'he', 'ru'] as const;

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Shown on the /lang keyboard — each label is written in its own script. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'EN',
  he: 'עברית',
  ru: 'RU',
};
