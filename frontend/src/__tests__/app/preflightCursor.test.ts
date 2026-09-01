/**
 * Tests for the interactive-element cursors in globals.css.
 * Covers: the pointer cursor that Tailwind v4's Preflight dropped for buttons,
 * and the one this app adds for selects and radios, which no Preflight ever
 * gave them. Both live in `@layer base`, so a utility class still overrides
 * them; these assertions are what keeps the next upgrade from dropping either.
 */

import { readFileSync } from "fs";
import { join } from "path";

describe("globals.css interactive cursors", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

  /** Does a base rule point the cursor at this selector, and only when enabled? */
  const pointsWhenEnabled = (selector: string) => {
    const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${literal}:not\\(:disabled\\)[\\s\\S]{0,160}?cursor:\\s*pointer`).test(css);
  };

  it("restores the pointer cursor on buttons, and only on enabled ones", () => {
    expect(pointsWhenEnabled("button")).toBe(true);
  });

  it('restores it on [role="button"] too, as Preflight v3 did', () => {
    expect(pointsWhenEnabled('[role="button"]')).toBe(true);
  });

  it("gives selects a pointer, and only enabled ones", () => {
    expect(pointsWhenEnabled("select")).toBe(true);
  });

  it("gives radios a pointer, and only enabled ones", () => {
    expect(pointsWhenEnabled('input[type="radio"]')).toBe(true);
  });

  it("does not point it at text inputs", () => {
    expect(pointsWhenEnabled('input[type="text"]')).toBe(false);
    expect(pointsWhenEnabled("textarea")).toBe(false);
  });
});
