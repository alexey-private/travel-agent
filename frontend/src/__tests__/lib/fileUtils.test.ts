import { formatBytes } from "@/lib/fileUtils";

describe("formatBytes", () => {
  it("keeps small sizes in bytes", () => {
    expect(formatBytes(512, "en")).toMatch(/512/);
  });

  it("switches to kilobytes", () => {
    expect(formatBytes(2048, "en")).toMatch(/2/);
    expect(formatBytes(2048, "en")).not.toMatch(/2048/);
  });

  it("switches to megabytes with one decimal", () => {
    expect(formatBytes(3_500_000, "en")).toMatch(/3\.3/);
  });

  it("uses the locale's decimal separator and unit label", () => {
    expect(formatBytes(3_500_000, "ru")).toMatch(/3,3\s*МБ/);
  });

  it("uses the Hebrew unit label where CLDR has one", () => {
    expect(formatBytes(512, "he")).toMatch(/[֐-׿]/);
  });

  // CLDR gives Hebrew no abbreviation of its own for kB/MB — Hebrew writes them
  // in Latin, the way it writes Google and Telegram. Asserting Hebrew letters
  // here would be asserting against the language, so this locks in the opposite:
  // the number is formatted for the locale, the unit is left as Hebrew uses it.
  it("keeps the Latin abbreviation Hebrew itself uses for larger units", () => {
    expect(formatBytes(3_500_000, "he")).toMatch(/3\.3\s*MB/);
  });
});
