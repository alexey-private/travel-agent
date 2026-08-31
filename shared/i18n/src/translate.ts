import type { Locale } from './locale';
import type { Dict, PluralForms, TVars } from './types';

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
 *
 * The dictionary is a parameter rather than a lookup inside this function: each
 * package owns its own dictionaries and its own key union, and stays free to
 * keep them out of a bundle that does not need them. `D` is inferred from the
 * call, so `key` is still checked against that package's real key set.
 */
export function translate<D extends Dict>(
  dict: D,
  locale: Locale,
  key: keyof D & string,
  vars?: TVars,
): string {
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
