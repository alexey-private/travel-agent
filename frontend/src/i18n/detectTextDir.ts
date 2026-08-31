/**
 * Which way a chat message reads.
 *
 * `dir="auto"` looks like the obvious answer and is the wrong one here. It
 * resolves on the first *strong* character, and a number of emoji are strong
 * left-to-right rather than neutral — the regional indicators behind a flag
 * (🇯🇵) and U+1F4A1 💡 among them. A Hebrew reply opening with `# 🇯🇵 יפן`
 * therefore resolved to `ltr`, and since `text-align` defaults to `start`, the
 * entire answer left-aligned.
 *
 * Nor can the interface locale answer it: the agent replies in the language of
 * the question, so a Hebrew answer lands in a Russian window.
 *
 * So the text decides, by counting letters — and the count is deliberately
 * lopsided. A Hebrew travel answer is full of Latin: airline names, IATA
 * codes, hotel names, URLs, whole tables of them. An English answer is not
 * correspondingly full of Hebrew. Latin therefore has to outnumber Hebrew by
 * more than three to one before the message counts as left-to-right; anything
 * short of that, and the Hebrew is the message rather than a fragment quoted
 * inside it. The backend's `detectReplyLocale` leans the same way for the same
 * reason, though it picks one of three languages where this picks one of two
 * directions.
 */

import { scriptRe, RTL_RANGE, LATIN_RANGE, CYRILLIC_RANGE } from "@travel-agent/i18n";

/** Every right-to-left script, from the one module that defines the ranges. */
const RTL_LETTERS = scriptRe(RTL_RANGE, "g");
/** Latin and Cyrillic — the left-to-right scripts this app actually serves. */
const LTR_LETTERS = scriptRe(LATIN_RANGE + CYRILLIC_RANGE, "g");

/** How far Latin must outnumber Hebrew before it wins. */
const LTR_MARGIN = 3;

export type TextDir = "ltr" | "rtl";

/**
 * How many letters of each script `text` holds.
 *
 * Split out so a growing message can be counted a chunk at a time — see
 * `useTextDirection`. Counts add: the letters in `a + b` are the letters in `a`
 * plus the letters in `b`, because neither pattern can match across a join.
 */
export function countLetters(text: string): { rtl: number; ltr: number } {
  return {
    rtl: (text.match(RTL_LETTERS) ?? []).length,
    ltr: (text.match(LTR_LETTERS) ?? []).length,
  };
}

/**
 * The direction those counts argue for, or `null` when they argue for nothing.
 *
 * `null` is not a third direction; it means no letter of either script has been
 * seen, so there is nothing yet to have a direction. A finished message in that
 * state — an emoji, a bare number — may as well be left-to-right, which is what
 * `detectTextDir` makes of it. A message still arriving is a different case: it
 * has no direction *yet*, and saying `ltr` there is a guess that has to be taken
 * back the moment the first Hebrew letter lands.
 */
export function dirFromCounts(rtl: number, ltr: number): TextDir | null {
  if (rtl === 0) return ltr === 0 ? null : "ltr";
  return rtl * LTR_MARGIN >= ltr ? "rtl" : "ltr";
}

/** The direction of a finished text, in one call. */
export function detectTextDir(text: string): TextDir {
  const { rtl, ltr } = countLetters(text);
  return dirFromCounts(rtl, ltr) ?? "ltr";
}
