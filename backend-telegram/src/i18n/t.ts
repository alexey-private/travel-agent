import { DEFAULT_LOCALE, translate, type Locale, type TVars } from '@travel-agent/i18n';
import { DICTIONARIES, type Dictionary, type TKey } from './dictionaries';

/**
 * Resolves one bot dictionary key into a display string.
 *
 * The resolver itself (placeholders, Intl.PluralRules) lives in
 * `@travel-agent/i18n`; this binds it to the bot's dictionaries so call sites
 * pass a locale and a key and nothing else. An unknown locale falls back to the
 * English dictionary rather than throwing on an undefined lookup.
 */
export function t(locale: Locale, key: TKey, vars?: TVars): string {
  const dict: Dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return translate(dict, locale, key, vars);
}
