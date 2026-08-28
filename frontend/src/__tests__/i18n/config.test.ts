import { LOCALES, DEFAULT_LOCALE, isLocale, dirOf, LOCALE_LABELS, LANG_COOKIE } from "@/i18n/config";

describe("i18n config", () => {
  it("exposes exactly the three supported locales", () => {
    expect(LOCALES).toEqual(["en", "he", "ru"]);
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("recognises supported locales and rejects everything else", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("marks Hebrew as right-to-left", () => {
    expect(dirOf("he")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(dirOf("ru")).toBe("ltr");
  });

  it("labels each locale in its own script", () => {
    expect(LOCALE_LABELS).toEqual({ en: "EN", he: "עברית", ru: "RU" });
  });

  it("names the cookie", () => {
    expect(LANG_COOKIE).toBe("lang");
  });
});
