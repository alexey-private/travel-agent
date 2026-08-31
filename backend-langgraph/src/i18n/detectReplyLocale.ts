import { Locale } from '@travel-agent/i18n';

/**
 * Which of the supported languages a finished agent reply is written in.
 *
 * The user's setting is not the answer: the agent follows the language of the
 * latest message, so a Hebrew-configured user who writes one English question
 * gets an English reply — and the follow-up suggestions under it have to match
 * the reply, not the setting.
 *
 * Script is the whole signal, which is enough precisely because the three
 * supported languages use three different alphabets. Latin is counted last and
 * loses ties, since Hebrew and Russian replies routinely carry Latin fragments
 * (IATA codes, airline names, URLs) while the reverse does not happen.
 */
export function detectReplyLocale(text: string, fallback: Locale): Locale {
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;

  if (hebrew === 0 && cyrillic === 0 && latin === 0) return fallback;
  if (hebrew >= cyrillic && hebrew >= latin) return 'he';
  if (cyrillic >= latin) return 'ru';
  return 'en';
}
