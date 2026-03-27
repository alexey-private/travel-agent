/**
 * Tests for src/data/starterSuggestions.ts
 * Covers: getRandomSuggestions filters by agentType, correct count, no duplicates, default agentType.
 */

import { getRandomSuggestions, ALL_SUGGESTIONS } from "@/data/starterSuggestions";

describe("getRandomSuggestions — count", () => {
  it("returns the requested number of suggestions", () => {
    expect(getRandomSuggestions(3, "travel")).toHaveLength(3);
    expect(getRandomSuggestions(5, "shopping")).toHaveLength(5);
  });

  it("returns all items when count >= pool size", () => {
    const travelAll = getRandomSuggestions(100, "travel");
    expect(travelAll).toHaveLength(ALL_SUGGESTIONS.travel.length);
  });
});

describe("getRandomSuggestions — agentType filtering", () => {
  it("returns only travel suggestions for agentType='travel'", () => {
    const result = getRandomSuggestions(ALL_SUGGESTIONS.travel.length, "travel");
    for (const s of result) {
      expect(ALL_SUGGESTIONS.travel).toContain(s);
    }
  });

  it("returns only shopping suggestions for agentType='shopping'", () => {
    const result = getRandomSuggestions(ALL_SUGGESTIONS.shopping.length, "shopping");
    for (const s of result) {
      expect(ALL_SUGGESTIONS.shopping).toContain(s);
    }
  });

  it("never mixes travel and shopping suggestions", () => {
    const travelResult = getRandomSuggestions(ALL_SUGGESTIONS.travel.length, "travel");
    for (const s of travelResult) {
      expect(ALL_SUGGESTIONS.shopping).not.toContain(s);
    }

    const shoppingResult = getRandomSuggestions(ALL_SUGGESTIONS.shopping.length, "shopping");
    for (const s of shoppingResult) {
      expect(ALL_SUGGESTIONS.travel).not.toContain(s);
    }
  });

  it("defaults to travel suggestions when agentType is omitted", () => {
    const result = getRandomSuggestions(5);
    for (const s of result) {
      expect(ALL_SUGGESTIONS.travel).toContain(s);
    }
  });
});

describe("getRandomSuggestions — no duplicates", () => {
  it("returns no duplicate suggestions", () => {
    const result = getRandomSuggestions(ALL_SUGGESTIONS.travel.length, "travel");
    expect(new Set(result).size).toBe(result.length);
  });
});
