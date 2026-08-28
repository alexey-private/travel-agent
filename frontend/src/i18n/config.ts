/**
 * Supported UI languages.
 *
 * These three values are mirrored in `backend-langgraph/src/i18n/locale.ts` and
 * `backend-telegram/src/i18n/config.ts`, and enforced by the CHECK constraint on
 * `user_service_preferences.language`. Adding a locale means touching all four.
 */
export type Locale = "en" | "he" | "ru";

export const LOCALES: readonly Locale[] = ["en", "he", "ru"] as const;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Shown in the language switcher — each label is written in its own script. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  he: "עברית",
  ru: "RU",
};

/** Read by the server component in app/layout.tsx to render <html dir> correctly. */
export const LANG_COOKIE = "lang";

/** Mirror of the cookie, used only when the cookie is missing. */
export const LANG_STORAGE_KEY = "lang";

/** One year, in seconds. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
