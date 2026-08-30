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

/** Hebrew, Arabic and Syriac, plus the Arabic and Hebrew presentation forms. */
const RTL_LETTERS = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\uFB1D-\uFDFF\uFE70-\uFEFC]/g;
/** Latin and Cyrillic — the left-to-right scripts this app actually serves. */
const LTR_LETTERS = /[A-Za-z\u0400-\u04FF]/g;

/** How far Latin must outnumber Hebrew before it wins. */
const LTR_MARGIN = 3;

export function detectTextDir(text: string): "ltr" | "rtl" {
  const rtl = (text.match(RTL_LETTERS) ?? []).length;
  if (rtl === 0) return "ltr";
  return rtl * LTR_MARGIN >= (text.match(LTR_LETTERS) ?? []).length ? "rtl" : "ltr";
}
