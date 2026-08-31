import { DEFAULT_LOCALE, translate, type Locale, type TVars } from '@travel-agent/i18n';
import { DICTIONARIES, type Dictionary, type TKey } from './dictionaries';
import { escapeHtml } from '../render';

/**
 * Resolves one bot dictionary key into a display string.
 *
 * The resolver itself (placeholders, Intl.PluralRules) lives in
 * `@travel-agent/i18n`; this binds it to the bot's dictionaries so call sites
 * pass a locale and a key and nothing else. An unknown locale falls back to the
 * English dictionary rather than throwing on an undefined lookup.
 *
 * Interpolated values are escaped; the template's own markup is not. A template
 * is ours and is written as HTML, but a value is routinely something we did not
 * write — an error message, a city name, a tool name — and every key that takes
 * one is sent with `parse_mode: 'HTML'`. Escaping here rather than at each call
 * site is what makes the next call site safe by default. The two values that
 * are themselves dictionary entries (`mode.travel`, `mode.shopping`,
 * interpolated into `mode.current` and `start.welcome`) carry no markup, so
 * escaping leaves them untouched.
 */
export function t(locale: Locale, key: TKey, vars?: TVars): string {
  const dict: Dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return translate(dict, locale, key, vars, escapeHtml);
}
