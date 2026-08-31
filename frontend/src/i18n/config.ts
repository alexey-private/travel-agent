/**
 * How the browser remembers the chosen language.
 *
 * The locale set itself — `Locale`, `LOCALES`, `isLocale`, `dirOf`,
 * `LOCALE_LABELS` — lives in `@travel-agent/i18n`, shared with the backend and
 * the Telegram bot. Only the storage keys below are the frontend's own.
 */

/** Read by the server component in app/layout.tsx to render <html dir> correctly. */
export const LANG_COOKIE = "lang";

/** Mirror of the cookie, used only when the cookie is missing. */
export const LANG_STORAGE_KEY = "lang";

/** One year, in seconds. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
