/**
 * Tests for src/data/starterSuggestions.ts
 *
 * A starter suggestion is both a button label and the message that goes to the
 * LLM, so it has to read as something a speaker of that language would actually
 * type. These tests guard the shape of the sets and the one property a
 * translation would break: that each set is written in its own language.
 */

import { ALL_SUGGESTIONS, getRandomSuggestions } from "@/data/starterSuggestions";
import { LOCALES } from "@travel-agent/i18n";
import { countIntl } from "../helpers/countIntl";

const HEBREW = /[֐-׿]/;
const CYRILLIC = /[Ѐ-ӿ]/;

describe("starter suggestions", () => {
  it("covers every locale and both agents", () => {
    for (const locale of LOCALES) {
      expect(ALL_SUGGESTIONS[locale].travel.length).toBeGreaterThanOrEqual(20);
      expect(ALL_SUGGESTIONS[locale].shopping.length).toBeGreaterThanOrEqual(16);
    }
  });

  it("gives every locale the same coverage of tools", () => {
    for (const locale of LOCALES) {
      expect(ALL_SUGGESTIONS[locale].travel).toHaveLength(ALL_SUGGESTIONS.en.travel.length);
      expect(ALL_SUGGESTIONS[locale].shopping).toHaveLength(ALL_SUGGESTIONS.en.shopping.length);
    }
  });

  it("writes Hebrew suggestions in Hebrew", () => {
    for (const s of [...ALL_SUGGESTIONS.he.travel, ...ALL_SUGGESTIONS.he.shopping]) {
      expect(s).toMatch(HEBREW);
    }
  });

  it("writes Russian suggestions in Cyrillic", () => {
    for (const s of [...ALL_SUGGESTIONS.ru.travel, ...ALL_SUGGESTIONS.ru.shopping]) {
      expect(s).toMatch(CYRILLIC);
    }
  });

  it("keeps the sets distinct rather than sharing one English pool", () => {
    for (const agent of ["travel", "shopping"] as const) {
      const en = new Set(ALL_SUGGESTIONS.en[agent]);
      for (const s of ALL_SUGGESTIONS.he[agent]) expect(en.has(s)).toBe(false);
      for (const s of ALL_SUGGESTIONS.ru[agent]) expect(en.has(s)).toBe(false);
    }
  });

  it("names the current month in the locale's own language", () => {
    const months = /January|February|March|April|May|June|July|August|September|October|November|December/;
    expect(ALL_SUGGESTIONS.he.travel.join(" ")).not.toMatch(months);
    expect(ALL_SUGGESTIONS.ru.travel.join(" ")).not.toMatch(months);
  });

  it("returns the requested number of distinct suggestions", () => {
    const picked = getRandomSuggestions(4, "travel", "he");
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
  });

  it("never returns more than the pool holds", () => {
    const picked = getRandomSuggestions(1000, "shopping", "ru");
    expect(picked.length).toBe(ALL_SUGGESTIONS.ru.shopping.length);
  });

  it("draws only from the requested locale and agent", () => {
    const pool = ALL_SUGGESTIONS.he.shopping;
    for (const s of getRandomSuggestions(pool.length, "shopping", "he")) {
      expect(pool).toContain(s);
    }
  });

  it("defaults to English travel suggestions", () => {
    for (const s of getRandomSuggestions(3)) {
      expect(ALL_SUGGESTIONS.en.travel).toContain(s);
    }
  });
});

describe("month names in suggestion text", () => {
  it("builds one month formatter per locale for the whole set", async () => {
    jest.resetModules();
    const counter = countIntl("DateTimeFormat");

    try {
      await import("@/data/starterSuggestions");

      // Dozens of suggestions name a month, and the sets are built at import.
      // Three locales, three formatters.
      expect(counter.count()).toBe(LOCALES.length);
    } finally {
      counter.restore();
    }
  });
});
