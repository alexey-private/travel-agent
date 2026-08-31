import type { Locale } from './locale';
import { perLocale } from './perLocale';
import type { Dict, PluralForms, TVars } from './types';

const PLACEHOLDER = /\{(\w+)\}/g;

const pluralRules = perLocale((locale) => new Intl.PluralRules(locale));

function isPluralForms(entry: unknown): entry is PluralForms {
  return typeof entry === 'object' && entry !== null && 'other' in entry;
}

/**
 * Resolves one dictionary key into a display string.
 *
 * Plural selection goes through Intl.PluralRules rather than a hand-rolled
 * rule, because Russian needs one/few/many while Hebrew and English need only
 * one/other — and `other` is the fallback whenever an entry lacks the form the
 * locale asked for. The rules object is built once per locale: every string on
 * a screen comes through here.
 *
 * The dictionary is a parameter rather than a lookup inside this function: each
 * package owns its own dictionaries and its own key union, and stays free to
 * keep them out of a bundle that does not need them. `D` is inferred from the
 * call, so `key` is still checked against that package's real key set.
 *
 * `escape` is applied to interpolated values only, never to the template. A
 * template is ours; a value is routinely something we did not write — an error
 * message, a city name, a tool name. A surface that renders its output as
 * markup has to escape values or inherit an injection; a surface that does not
 * must leave them alone, or its text arrives full of entity references. Taking
 * it here rather than at each call site is what makes the next call site safe
 * by default.
 */
export function translate<D extends Dict>(
  dict: D,
  locale: Locale,
  key: keyof D & string,
  vars?: TVars,
  escape?: (value: string) => string,
): string {
  const entry: unknown = dict[key];

  if (entry === undefined) return String(key);

  let template: string;
  if (isPluralForms(entry)) {
    const count = Number(vars?.count ?? 0);
    const form = pluralRules(locale).select(count) as keyof PluralForms;
    template = entry[form] ?? entry.other;
  } else {
    template = String(entry);
  }

  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    if (!(name in vars)) return match;
    const value = String(vars[name]);
    return escape ? escape(value) : value;
  });
}
