import { parseAcceptLanguage, pickLocale, browserLocale, headerLocale } from "@/i18n/detectLocale";

describe("parseAcceptLanguage", () => {
  it("returns an empty list for a missing header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("orders tags by descending q-weight", () => {
    // The header is not written in preference order — the weights carry it.
    expect(parseAcceptLanguage("en;q=0.9, he, ru;q=0.5")).toEqual(["he", "en", "ru"]);
  });

  it("keeps the written order among equally weighted tags", () => {
    expect(parseAcceptLanguage("he, en, ru")).toEqual(["he", "en", "ru"]);
  });

  it("drops entries the client explicitly refused", () => {
    expect(parseAcceptLanguage("he;q=0, en")).toEqual(["en"]);
  });

  it("survives a malformed weight rather than ranking it first", () => {
    expect(parseAcceptLanguage("he;q=oops, en")).toEqual(["en"]);
  });
});

describe("pickLocale", () => {
  it("matches on the primary subtag", () => {
    expect(pickLocale(["he-IL"])).toBe("he");
    expect(pickLocale(["ru-RU"])).toBe("ru");
    expect(pickLocale(["en-GB"])).toBe("en");
  });

  it("accepts the legacy Hebrew code", () => {
    expect(pickLocale(["iw-IL"])).toBe("he");
  });

  it("ignores case", () => {
    expect(pickLocale(["HE-il"])).toBe("he");
  });

  it("skips unsupported tags and takes the first supported one", () => {
    expect(pickLocale(["fr-FR", "de", "ru"])).toBe("ru");
  });

  it("returns null when nothing matches", () => {
    expect(pickLocale(["fr", "de"])).toBeNull();
    expect(pickLocale([])).toBeNull();
    expect(pickLocale(["*"])).toBeNull();
  });
});

describe("headerLocale", () => {
  it("reads the preferred supported language out of a real header", () => {
    expect(headerLocale("he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("he");
  });

  it("falls back to the default when the header names nothing we support", () => {
    expect(headerLocale("fr-FR,de;q=0.8")).toBe("en");
    expect(headerLocale(null)).toBe("en");
  });
});

describe("browserLocale", () => {
  afterEach(() => {
    // Both are prototype getters in jsdom; dropping our own properties restores them.
    Reflect.deleteProperty(window.navigator, "languages");
    Reflect.deleteProperty(window.navigator, "language");
  });

  it("prefers navigator.languages, best first", () => {
    Object.defineProperty(window.navigator, "languages", {
      value: ["fr-FR", "he-IL", "en-US"],
      configurable: true,
    });
    expect(browserLocale()).toBe("he");
  });

  it("falls back to navigator.language when the list is empty", () => {
    Object.defineProperty(window.navigator, "languages", { value: [], configurable: true });
    Object.defineProperty(window.navigator, "language", { value: "ru-RU", configurable: true });
    expect(browserLocale()).toBe("ru");
  });

  it("returns null when the browser names no language we support", () => {
    Object.defineProperty(window.navigator, "languages", {
      value: ["fr-FR"],
      configurable: true,
    });
    expect(browserLocale()).toBeNull();
  });
});
