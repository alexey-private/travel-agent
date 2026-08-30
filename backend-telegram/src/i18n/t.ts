import { DEFAULT_LOCALE, type Locale } from './config';
import { DICTIONARIES, type Dictionary, type TKey } from './dictionaries';
import type { PluralForms, TVars } from './types';
import { escapeHtml } from '../render';

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
 * Interpolated values are escaped; the template's own markup is not. A
 * template is ours and is written as HTML, but a value is routinely something
 * we did not write — an error message, a city name, a tool name — and every
 * key that takes one is sent with `parse_mode: 'HTML'`. Escaping here rather
 * than at each call site is what makes the next call site safe by default.
 * The two values that are themselves dictionary entries (`mode.travel`,
 * `mode.shopping`, interpolated into `mode.current` and `start.welcome`) carry
 * no markup, so escaping leaves them untouched.
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
    name in vars ? escapeHtml(String(vars[name])) : match,
  );
}
