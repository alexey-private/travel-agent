import type { Locale } from "./config";
import { perLocale } from "./perLocale";
import type { Dictionary, TKey } from "./dictionaries";
import type { PluralForms, TVars } from "./types";

const PLACEHOLDER = /\{(\w+)\}/g;

const pluralRules = perLocale((locale) => new Intl.PluralRules(locale));

function isPluralForms(entry: unknown): entry is PluralForms {
  return typeof entry === "object" && entry !== null && "other" in entry;
}

/**
 * Resolves one dictionary key into a display string.
 *
 * Plural selection goes through Intl.PluralRules rather than a hand-rolled
 * rule, because Russian needs one/few/many while Hebrew and English need only
 * one/other — and `other` is the fallback whenever an entry lacks the form the
 * locale asked for. The rules object is built once per locale: every string
 * on a screen comes through here.
 */
export function translate(dict: Dictionary, locale: Locale, key: TKey, vars?: TVars): string {
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
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
