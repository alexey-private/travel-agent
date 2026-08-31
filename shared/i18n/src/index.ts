/**
 * The locale primitives every package shares: the set of supported languages,
 * the shape of a dictionary entry, the resolver that turns one entry into a
 * display string, and the character ranges that say which writing system a
 * piece of text belongs to. Everything surface-specific — the dictionaries
 * themselves, the language cookie, the bot's session cache, the PDF's
 * logical-to-visual reordering — stays in the package that owns that surface.
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

export { perLocale } from './perLocale';

export {
  HEBREW_RANGE,
  ARABIC_TO_ARABIC_EXT_RANGE,
  RTL_PRESENTATION_FORMS_RANGE,
  RTL_RANGE,
  CYRILLIC_RANGE,
  LATIN_RANGE,
  scriptRe,
  containsRtl,
} from './scripts';
