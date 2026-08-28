import { formatDate } from "@/lib/dateUtils";

const NOW = new Date("2026-08-28T12:00:00Z");
const iso = (d: string) => new Date(d).toISOString();

describe("formatDate", () => {
  it("shows the time for today", () => {
    const out = formatDate(iso("2026-08-28T09:30:00Z"), "en", NOW);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("says yesterday in English", () => {
    expect(formatDate(iso("2026-08-27T09:30:00Z"), "en", NOW)).toBe("yesterday");
  });

  it("says yesterday in Hebrew", () => {
    expect(formatDate(iso("2026-08-27T09:30:00Z"), "he", NOW)).toBe("אתמול");
  });

  it("says yesterday in Russian", () => {
    expect(formatDate(iso("2026-08-27T09:30:00Z"), "ru", NOW)).toBe("вчера");
  });

  it("shows a weekday name inside the last week, in the requested locale", () => {
    const en = formatDate(iso("2026-08-25T09:30:00Z"), "en", NOW);
    const he = formatDate(iso("2026-08-25T09:30:00Z"), "he", NOW);
    expect(en).not.toBe(he);
    expect(he).toMatch(/[֐-׿]/);
  });

  it("shows month and day beyond a week, in the requested locale", () => {
    const ru = formatDate(iso("2026-07-01T09:30:00Z"), "ru", NOW);
    expect(ru).toMatch(/[Ѐ-ӿ]/);
  });
});
