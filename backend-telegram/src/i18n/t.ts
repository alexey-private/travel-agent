import { DEFAULT_LOCALE, type Locale } from './config';
import { DICTIONARIES, type Dictionary, type TKey } from './dictionaries';
import type { PluralForms, TVars } from './types';

const PLACEHOLDER = /\{(\w+)\}/g;

function isPluralForms(entry: unknown): entry is PluralForms {
  return typeof entry === 'object' && entry !== null && 'other' in entry;
}

/**
 * Resolves one dictionary key into a display string.
 *
 * Plural selection goes through Intl.PluralRules rather than a hand-rolled
 * rule, because Russian needs one/few/many while Hebrew and English need only
 * one/other — and `other` is the fallback whenever an entry lacks the form the
 * locale asked for.
 */
export function t(locale: Locale, key: TKey, vars?: TVars): string {
  const dict: Dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const entry: unknown = dict[key];
  if (entry === undefined) return String(key);

  let template: string;
  if (isPluralForms(entry)) {
    const count = Number(vars?.count ?? 0);
    const form = new Intl.PluralRules(locale).select(count) as keyof PluralForms;
    template = entry[form] ?? entry.other;
  } else {
    template = String(entry);
  }

  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
