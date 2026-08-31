/**
 * Which characters belong to which writing system.
 *
 * Three modules used to answer this question independently — the frontend's
 * direction sniffer, the backend's reply-language sniffer, and the PDF's
 * "does this need reordering at all" test — and they disagreed on both the
 * ranges and the notation. Two of them embedded literal glyphs, which are
 * invisible in a diff, unreadable in review, and fragile under re-encoding.
 *
 * The ranges live here, once, written as escapes. They are exported as regex
 * *class bodies* rather than finished patterns because the callers want
 * different combinations of them: one counts Hebrew against Cyrillic against
 * Latin, another wants every right-to-left script at once.
 */

/** Hebrew, without its presentation forms. */
export const HEBREW_RANGE = '\\u0590-\\u05FF';

/**
 * Arabic through the Arabic Extended-A block: Arabic, Syriac, Thaana, NKo,
 * Samaritan, Mandaic. Deliberately wider than the languages this app serves —
 * these ranges only ever decide *which direction* text runs in, and getting
 * that right for a language we do not otherwise support costs nothing.
 */
export const ARABIC_TO_ARABIC_EXT_RANGE = '\\u0600-\\u08FF';

/** Hebrew and Arabic presentation forms (Alphabetic Presentation Forms, Arabic Presentation Forms-A/B). */
export const RTL_PRESENTATION_FORMS_RANGE = '\\uFB1D-\\uFDFF\\uFE70-\\uFEFC';

/** Every right-to-left range, in one class body. */
export const RTL_RANGE =
  HEBREW_RANGE + ARABIC_TO_ARABIC_EXT_RANGE + RTL_PRESENTATION_FORMS_RANGE;

/** Cyrillic, without the supplement — the app serves Russian, not Abkhaz. */
export const CYRILLIC_RANGE = '\\u0400-\\u04FF';

/** Basic Latin letters. Accented Latin lives elsewhere and is not counted. */
export const LATIN_RANGE = 'A-Za-z';

/**
 * A matcher for one or more of the ranges above.
 *
 * A new regex every call, so each caller owns its own: a global regex carries
 * `lastIndex` between calls, and a shared one would silently skip matches for
 * whoever ran second. Holding the result in a module constant is safe for
 * `String.match`, which resets `lastIndex`, and is not safe for `RegExp.test`.
 */
export function scriptRe(range: string, flags = ''): RegExp {
  return new RegExp(`[${range}]`, flags);
}

/**
 * Whether the text holds any right-to-left letter at all.
 *
 * The question the PDF exporter asks when no language was sent with the
 * document: one right-to-left letter is enough to make reordering necessary,
 * since the alternative is painting it backwards.
 */
export function containsRtl(text: string): boolean {
  return scriptRe(RTL_RANGE).test(text);
}
