import { detectTextDir } from "@/i18n/detectTextDir";

describe("detectTextDir", () => {
  it("reads Hebrew right-to-left and Latin or Cyrillic left-to-right", () => {
    expect(detectTextDir("שלום, מצאתי 3 טיסות")).toBe("rtl");
    expect(detectTextDir("I found 3 flights")).toBe("ltr");
    expect(detectTextDir("Нашёл 3 рейса")).toBe("ltr");
  });

  // The whole reason this exists. `dir="auto"` resolves on the first strong
  // character, and these two are strong left-to-right rather than neutral.
  it("ignores emoji that carry a left-to-right direction of their own", () => {
    expect(detectTextDir("🇯🇵 יפן — כל מה שצריך לדעת")).toBe("rtl");
    expect(detectTextDir("💡 טיפ חשוב")).toBe("rtl");
  });

  // A Hebrew answer about travel is full of Latin: airline names, IATA codes,
  // URLs. Outnumbered by them, the opening letter still settles it.
  it("keeps a Hebrew reply right-to-left despite Latin fragments", () => {
    expect(detectTextDir("טיסה עם El Al מ-TLV ל-NRT דרך Japan Airlines")).toBe("rtl");
  });

  // The opening word carries no weight, so an answer that starts on a Latin
  // brand name is still Hebrew if the body is.
  it("keeps a Hebrew reply right-to-left when it opens on Latin", () => {
    expect(detectTextDir("Japan Rail Pass — כרטיס לרכבות, כדאי לקנות מראש")).toBe("rtl");
  });

  // The hard case: a data-heavy answer where Latin outnumbers Hebrew outright
  // *and* comes first. This is the shape of the reply that reported the bug —
  // a table of Japanese terms, timezones and prices wrapped in Hebrew prose.
  it("keeps a Hebrew reply right-to-left when Latin both leads and outnumbers it", () => {
    expect(
      detectTextDir(
        "JST — Japan Standard Time (UTC+9) בקיץ, שעון ישראל UTC+3, הפרש 6 שעות קדימה",
      ),
    ).toBe("rtl");
  });

  // And the reverse stays honest: a Hebrew name inside an English answer must
  // not flip the whole bubble.
  it("leaves an English reply alone when it quotes Hebrew", () => {
    expect(detectTextDir("The hotel is called מלון דן and it sits on the beach")).toBe("ltr");
  });

  // The margin has to end somewhere: past three Latin letters to one Hebrew,
  // the Hebrew is a fragment quoted inside a left-to-right answer.
  it("gives a tie to right-to-left and hands overwhelming Latin the other way", () => {
    expect(detectTextDir("abcd אבגד")).toBe("rtl");
    expect(detectTextDir("abcdefghijkl אבגד")).toBe("rtl");
    expect(detectTextDir("abcdefghijklm אבגד")).toBe("ltr");
  });

  it("falls back to left-to-right when there is nothing to read", () => {
    expect(detectTextDir("")).toBe("ltr");
    expect(detectTextDir("¥10,000 / ¥5,000 — 🇯🇵")).toBe("ltr");
  });
});
