import { translate } from "@/i18n/translate";
import type { Dictionary } from "@/i18n/dictionaries";
import type { PluralForms } from "@/i18n/types";

const dict = {
  "chat.send": "Send",
  "chat.attached": "{count} file attached",
  "memory.itemsCount": { one: "{count} item", other: "{count} items" } as PluralForms,
  "memory.itemsCountRu": {
    one: "{count} запись",
    few: "{count} записи",
    many: "{count} записей",
    other: "{count} записи",
  } as PluralForms,
} as unknown as Dictionary;

const key = (k: string) => k as any;

describe("translate", () => {
  it("returns a plain string as-is", () => {
    expect(translate(dict, "en", key("chat.send"))).toBe("Send");
  });

  it("interpolates named variables", () => {
    expect(translate(dict, "en", key("chat.attached"), { count: 3 })).toBe("3 file attached");
  });

  it("leaves an unknown placeholder untouched", () => {
    expect(translate(dict, "en", key("chat.attached"))).toBe("{count} file attached");
  });

  it("selects the English singular and plural", () => {
    expect(translate(dict, "en", key("memory.itemsCount"), { count: 1 })).toBe("1 item");
    expect(translate(dict, "en", key("memory.itemsCount"), { count: 5 })).toBe("5 items");
  });

  it("selects Russian few and many forms", () => {
    expect(translate(dict, "ru", key("memory.itemsCountRu"), { count: 1 })).toBe("1 запись");
    expect(translate(dict, "ru", key("memory.itemsCountRu"), { count: 3 })).toBe("3 записи");
    expect(translate(dict, "ru", key("memory.itemsCountRu"), { count: 7 })).toBe("7 записей");
  });

  it("falls back to `other` when a locale asks for a form the entry lacks", () => {
    expect(translate(dict, "ru", key("memory.itemsCount"), { count: 3 })).toBe("3 items");
  });

  it("returns the key itself when it is missing from the dictionary", () => {
    expect(translate(dict, "en", key("nope.missing"))).toBe("nope.missing");
  });
});
