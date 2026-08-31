/**
 * The locale primitives every package shares: the set of supported languages,
 * the shape of a dictionary entry, and the resolver that turns one entry into a
 * display string. Everything language-specific — the dictionaries themselves,
 * the language cookie, the bot's session cache, the PDF direction helpers —
 * stays in the package that owns that surface.
 */
export {
  type Locale,
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  dirOf,
  LOCALE_LABELS,
  LANGUAGE_NAMES,
} from './locale';

export type { Dict, Entry, PluralForms, TVars } from './types';

export { translate } from './translate';
