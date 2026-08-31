import { formatDate } from "@/lib/dateUtils";
import { countIntl } from "../helpers/countIntl";

const NOW = new Date("2026-08-28T12:00:00Z");
const iso = (d: string) => new Date(d).toISOString();

describe("formatDate", () => {
  it("shows the time for today, on a 24-hour clock", () => {
    // Anchored, and no meridiem: English would otherwise render "09:30 AM", and
    // a pattern loose enough to accept that cannot tell the two clocks apart.
    // The exact digits stay unasserted — this formats in the machine's timezone.
    for (const locale of ["en", "he", "ru"] as const) {
      expect(formatDate(iso("2026-08-28T09:30:00Z"), locale, NOW)).toMatch(/^\d{2}:\d{2}$/);
    }
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

describe("formatDate formatter reuse", () => {
  it("builds one formatter per locale, not one per timestamp", async () => {
    jest.resetModules();
    const counter = countIntl("DateTimeFormat");

    try {
      const { formatDate: fresh } = await import("@/lib/dateUtils");

      // A chat list formats a timestamp for every row it renders. Ten rows on
      // the same branch have to cost one formatter — that is the whole change,
      // and the rendered string is identical either way.
      for (let i = 0; i < 10; i += 1) {
        fresh(iso("2026-08-28T09:30:00Z"), "ru", NOW);
      }
      expect(counter.count()).toBe(1);

      // A second language is a second formatter, and no more than one.
      fresh(iso("2026-08-28T09:30:00Z"), "en", NOW);
      fresh(iso("2026-08-28T09:30:00Z"), "en", NOW);
      expect(counter.count()).toBe(2);
    } finally {
      counter.restore();
    }
  });
});
