import bidiFactory from 'bidi-js';
import { Locale, containsRtl } from '@travel-agent/i18n';

export type BaseDir = 'ltr' | 'rtl';

const bidi = bidiFactory();

/**
 * Which scripts count as right-to-left is a fact about languages, not about
 * PDFs, so it lives in `@travel-agent/i18n` alongside the ranges the frontend
 * and the reply-language sniffer use. Re-exported here because this module is
 * where the exporter looks for it.
 */
export { containsRtl };

/**
 * Rewrites a string from logical order (the order it was typed) into visual
 * order (the order it must be painted).
 *
 * pdfkit draws glyphs strictly left to right in string order and implements no
 * part of the Unicode Bidirectional Algorithm, so Hebrew handed to it verbatim
 * comes out backwards. Reordering is enough for Hebrew because its letters do
 * not join — unlike Arabic, it needs no glyph shaping.
 *
 * For a left-to-right string this is the identity, which is what keeps English
 * and Russian PDFs byte-for-byte what they were before any of this existed.
 */
export function toVisual(text: string, baseDir: BaseDir): string {
  if (!text) return text;

  const levels = bidi.getEmbeddingLevels(text, baseDir);
  return bidi.getReorderedString(text, levels);
}

/**
 * Greedy word wrap.
 *
 * Exists because the bidirectional algorithm is defined per visual line:
 * reordering a whole paragraph and letting the PDF library wrap it afterwards
 * would slice already-reversed text at an arbitrary point, and every line would
 * come out with its words in the wrong order. So the breaks are decided here
 * first, and each resulting line is reordered on its own.
 *
 * `measure` is injected to keep this pure — pdfkit's `widthOfString` in
 * production, a stub in tests.
 */
export function wrapToWidth(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (!text) return [''];
  if (measure(text) <= maxWidth) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
      // A single word wider than the column gets its own line rather than being
      // dropped or hyphenated: overflowing the margin is more honest than losing
      // content.
      if (!current.includes(' ') && measure(current) > maxWidth) {
        lines.push(current);
        current = '';
      }
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  // Reachable for a string of nothing but spaces: every word is empty, so
  // nothing is ever pushed. Return the input rather than an invented blank.
  return lines.length > 0 ? lines : [text];
}

/** Explicit locale wins; without one, fall back to what the text itself contains. */
export function baseDirFor(locale: Locale | undefined, text: string): BaseDir {
  if (locale) return locale === 'he' ? 'rtl' : 'ltr';
  return containsRtl(text) ? 'rtl' : 'ltr';
}
