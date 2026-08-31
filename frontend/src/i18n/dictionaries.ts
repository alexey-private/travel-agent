import type { Locale } from "@travel-agent/i18n";
import { en } from "./locales/en";
import { he } from "./locales/he";
import { ru } from "./locales/ru";

/** Shape of every dictionary, inferred from the English one. */
export type Dictionary = typeof en;

/** Every valid translation key. */
export type TKey = keyof Dictionary;

export const DICTIONARIES: Record<Locale, Dictionary> = { en, he, ru };
