import {
  Locale,
  scriptRe,
  HEBREW_RANGE,
  CYRILLIC_RANGE,
  LATIN_RANGE,
} from '@travel-agent/i18n';

const HEBREW = scriptRe(HEBREW_RANGE, 'g');
const CYRILLIC = scriptRe(CYRILLIC_RANGE, 'g');
const LATIN = scriptRe(LATIN_RANGE, 'g');

/**
 * Which of the supported languages a piece of the conversation is written in.
 *
 * The user's setting is not the answer: the agent follows the language of the
 * latest message, so a Hebrew-configured user who writes one English question
 * gets an English reply — and the follow-up suggestions under it have to match
 * the reply, not the setting.
 *
 * Named for the reply because that was the first thing that needed it, but the
 * question is the same for either side of the exchange: memory extraction asks
 * it of the user's own message, because the prompt tells the model what language
 * the text in front of it is in.
 *
 * Script is the whole signal, which is enough precisely because the three
 * supported languages use three different alphabets. Latin is counted last and
 * loses ties, since Hebrew and Russian replies routinely carry Latin fragments
 * (IATA codes, airline names, URLs) while the reverse does not happen.
 */
export function detectReplyLocale(text: string, fallback: Locale): Locale {
  const hebrew = (text.match(HEBREW) ?? []).length;
  const cyrillic = (text.match(CYRILLIC) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;

  if (hebrew === 0 && cyrillic === 0 && latin === 0) return fallback;
  if (hebrew >= cyrillic && hebrew >= latin) return 'he';
  if (cyrillic >= latin) return 'ru';
  return 'en';
}
