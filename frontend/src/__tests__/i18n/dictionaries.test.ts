import { DICTIONARIES } from "@/i18n/dictionaries";
import { LOCALES } from "@travel-agent/i18n";
import type { Entry, PluralForms } from "@travel-agent/i18n";

const HEBREW = /[֐-׿]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Keys whose value is a brand name or a literal the user retypes, and so stays
 * in Latin script in every language. Everything else must be translated.
 */
const ALLOWED_LATIN_ONLY = new Set<string>([
  "chat.pdf", // the file format, written PDF everywhere
  "memory.appleICloud", // brand
  "memory.googleCalendar", // brand
  "settings.appleTitle", // brand
  "settings.appleIdLabel", // Apple's own name for the credential
  "settings.appleIdPlaceholder", // an example address, not prose
  "settings.appPasswordPlaceholder", // the literal password shape
  "settings.driveTitle", // brand
]);

function values(dict: Record<string, Entry>): [string, string][] {
  return Object.entries(dict).flatMap(([key, entry]) =>
    typeof entry === "string"
      ? [[key, entry] as [string, string]]
      : Object.values(entry).map((v) => [key, v as string] as [string, string]),
  );
}

describe("dictionaries", () => {
  it("has the same key set in every locale", () => {
    const reference = Object.keys(DICTIONARIES.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort()).toEqual(reference);
    }
  });

  it("translates every Hebrew entry", () => {
    for (const [key, value] of values(DICTIONARIES.he)) {
      if (ALLOWED_LATIN_ONLY.has(key)) continue;
      expect(`${key}: ${value}`).toMatch(HEBREW);
    }
  });

  it("translates every Russian entry", () => {
    for (const [key, value] of values(DICTIONARIES.ru)) {
      if (ALLOWED_LATIN_ONLY.has(key)) continue;
      expect(`${key}: ${value}`).toMatch(CYRILLIC);
    }
  });

  it("leaves the allowed Latin entries alone in every locale", () => {
    for (const key of ALLOWED_LATIN_ONLY) {
      for (const locale of LOCALES) {
        expect(DICTIONARIES[locale][key as keyof (typeof DICTIONARIES)["en"]]).toEqual(
          DICTIONARIES.en[key as keyof (typeof DICTIONARIES)["en"]],
        );
      }
    }
  });

  it("keeps every placeholder that the English entry declares", () => {
    for (const locale of LOCALES) {
      for (const [key, enValue] of values(DICTIONARIES.en)) {
        const placeholders = [...enValue.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        if (placeholders.length === 0) continue;
        const translated = values(DICTIONARIES[locale]).filter(([k]) => k === key);
        for (const [, value] of translated) {
          for (const name of placeholders) {
            expect(`${locale}/${key}: ${value}`).toContain(`{${name}}`);
          }
        }
      }
    }
  });

  it("gives Russian plural entries the few and many forms", () => {
    for (const [key, entry] of Object.entries(DICTIONARIES.ru)) {
      if (typeof entry === "string") continue;
      const forms = entry as PluralForms;
      expect(`${key}.few: ${forms.few}`).toMatch(CYRILLIC);
      expect(`${key}.many: ${forms.many}`).toMatch(CYRILLIC);
    }
  });
});
