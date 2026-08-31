import type { Locale } from "@travel-agent/i18n";
import { en } from "./locales/en";
import { he } from "./locales/he";
import { ru } from "./locales/ru";

/** Shape of every dictionary, inferred from the English one. */
export type Dictionary = typeof en;

/** Every valid translation key. */
export type TKey = keyof Dictionary;

/**
 * Every dictionary, held together — all three on purpose.
 *
 * Shipping a visitor two languages they cannot read looks like an obvious thing
 * to split and is not. Measured by differential production build, the two
 * unused dictionaries are 4.1 KB gzipped and their starter sets another 3.0 KB,
 * against a 250 KB first load. Collecting that costs more than it returns:
 * `LanguageProvider` needs the dictionary synchronously at hydration, so the
 * only ways to fetch one are to inline it in the document — which is
 * `no-store`, paid on every navigation, while this chunk is `immutable` and
 * paid once per deploy — or to make the first render async and paint the wrong
 * language first. A `[locale]` route segment would change that arithmetic;
 * nothing short of it does. The numbers are under O6 in
 * [the security audit findings](../../../docs/superpowers/specs/2026-08-30-security-audit-findings.md).
 */
export const DICTIONARIES: Record<Locale, Dictionary> = { en, he, ru };
