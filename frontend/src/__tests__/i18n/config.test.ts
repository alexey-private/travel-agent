import { LANG_COOKIE, LANG_STORAGE_KEY, LANG_COOKIE_MAX_AGE } from "@/i18n/config";

// The locale set itself (LOCALES, isLocale, dirOf, LOCALE_LABELS) is owned and
// tested by @travel-agent/i18n — see shared/i18n/tests/locale.test.ts.
describe("i18n config", () => {
  it("names the cookie and its localStorage mirror the same", () => {
    expect(LANG_COOKIE).toBe("lang");
    expect(LANG_STORAGE_KEY).toBe("lang");
  });

  it("keeps the cookie for a year", () => {
    expect(LANG_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });
});
