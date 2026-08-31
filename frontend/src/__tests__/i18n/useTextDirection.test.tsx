/**
 * Tests for useTextDirection — the direction of a message that arrives a chunk
 * at a time.
 *
 * Two properties matter and they pull in opposite directions: the answer has to
 * be the same one `detectTextDir` gives for the finished text (the counting is
 * incremental, and incremental counting is where drift hides), and it has to
 * stop changing under the reader (the direction used to be guessed before there
 * was anything to guess from).
 */

import React, { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { useTextDirection } from "@/i18n/useTextDirection";
import { detectTextDir } from "@/i18n/detectTextDir";

/** Renders the hook over a growing string, returning what it said at each step. */
function stream(prefixes: string[]): (("ltr" | "rtl") | undefined)[] {
  const { result, rerender } = renderHook((text: string) => useTextDirection(text, true), {
    initialProps: prefixes[0] ?? "",
  });
  const seen = [result.current];
  for (const p of prefixes.slice(1)) {
    rerender(p);
    seen.push(result.current);
  }
  return seen;
}

/** What the hook says about a message that has finished arriving. */
function finished(text: string): "ltr" | "rtl" | undefined {
  return renderHook(() => useTextDirection(text, false)).result.current;
}

/** Every prefix of `text`, one character (not one code unit) at a time. */
function prefixesOf(text: string): string[] {
  const out: string[] = [];
  let acc = "";
  for (const ch of text) {
    acc += ch;
    out.push(acc);
  }
  return out;
}

describe("useTextDirection — before the text says anything", () => {
  it("has no answer for a message that has not started", () => {
    expect(stream([""])).toEqual([undefined]);
  });

  // The whole point. `# 🇯🇵` holds no letter of any script, so the old code
  // called it `ltr` and left-aligned the bubble; the first Hebrew letter then
  // moved the entire reply to the right in front of the reader. Undefined means
  // no `dir` attribute, and the bubble keeps the document's own direction until
  // the text overrules it.
  it("declines to answer while the reply is still only an emoji heading", () => {
    expect(stream(["#", "# ", "# 🇯🇵", "# 🇯🇵 "])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("answers as soon as one letter arrives", () => {
    const seen = stream(["# 🇯🇵 ", "# 🇯🇵 י"]);
    expect(seen).toEqual([undefined, "rtl"]);
  });

  // Numbers, punctuation and currency are not evidence for either side.
  it("treats a message of digits and symbols as undecided while it arrives", () => {
    expect(stream(["120 $ — 3:45 (+9)"])).toEqual([undefined]);
  });
});

describe("useTextDirection — once the message has finished", () => {
  // Saying nothing is for a gap in the evidence, not for a message that simply
  // has no letters in it. That one is finished, `ltr` is the answer
  // `detectTextDir` has always given for it, and leaving it without a direction
  // for good would hand it to the interface locale — so switching languages
  // would re-align a bubble the reader has already read.
  it("gives a letterless message the direction it always had", () => {
    expect(finished("120 $ — 3:45 (+9)")).toBe("ltr");
    expect(finished("120 $ — 3:45 (+9)")).toBe(detectTextDir("120 $ — 3:45 (+9)"));
    expect(finished("🇯🇵 ✈️ 🏨")).toBe("ltr");
    expect(finished("")).toBe("ltr");
  });

  it("still reads a finished message that does have letters", () => {
    expect(finished("שלום")).toBe("rtl");
    expect(finished("I found 3 flights")).toBe("ltr");
  });
});

describe("useTextDirection — while the message streams", () => {
  // The reply from the bug report, one character at a time. Once a direction is
  // named it must not be replaced by the other one.
  it("never reverses a direction it has already shown", () => {
    const text = "# 🇯🇵 יפן — כל מה שצריך לדעת\n\nטיסה עם El Al מ-TLV ל-NRT דרך Japan Airlines.";
    const shown = stream(prefixesOf(text)).filter((d): d is "ltr" | "rtl" => d !== undefined);

    expect(shown.length).toBeGreaterThan(0);
    expect(new Set(shown)).toEqual(new Set(["rtl"]));
  });

  // The counting is incremental; this is what proves it did not drift. At every
  // prefix the hook has to agree with a fresh full scan of that same prefix —
  // except where the hook says nothing, which is exactly where the full scan is
  // falling back to `ltr` for want of any letters.
  it("agrees with a full scan at every prefix", () => {
    const text = "Japan Rail Pass — כרטיס לרכבות. JST (UTC+9) בקיץ, שעון ישראל UTC+3.";
    const prefixes = prefixesOf(text);
    const seen = stream(prefixes);

    prefixes.forEach((prefix, i) => {
      expect(seen[i] ?? "ltr").toBe(detectTextDir(prefix));
    });
  });

  // The one flip that stays, and it is not a bug: this reply opens on three
  // Latin letters, which is real evidence and is read as such, and the Hebrew
  // that overturns it arrives forty characters later. Nothing short of waiting
  // for the whole message avoids that, and waiting means showing nothing. What
  // the hook owes here is only that the totals win in the end.
  it("lets a Hebrew body overrule the Latin it opened on", () => {
    const text = "JST — Japan Standard Time (UTC+9) בקיץ, שעון ישראל UTC+3, הפרש 6 שעות קדימה";
    const seen = stream(prefixesOf(text));

    expect(seen[0]).toBe("ltr");
    expect(seen[seen.length - 1]).toBe("rtl");
    expect(seen[seen.length - 1]).toBe(detectTextDir(text));
  });

  it("leaves an English answer left-to-right throughout", () => {
    const seen = stream(prefixesOf("I found 3 flights to Tokyo"));
    expect(new Set(seen.filter((d) => d !== undefined))).toEqual(new Set(["ltr"]));
  });
});

describe("useTextDirection — text that is not an extension", () => {
  // The cache is keyed on the text it counted, not on its length. A different
  // message of the same length in a reused instance has to be recounted, not
  // answered from what the previous one added up to.
  it("recounts when the text is replaced rather than extended", () => {
    const hebrew = "שלום שלום שלום שלום";
    const latin  = "hello hello world..";
    expect(latin).toHaveLength(hebrew.length);

    const { result, rerender } = renderHook((text: string) => useTextDirection(text), {
      initialProps: hebrew,
    });
    expect(result.current).toBe("rtl");

    rerender(latin);
    expect(result.current).toBe("ltr");
  });

  // A render React started with newer state and threw away leaves the cache
  // ahead of the text; going backwards has to recount rather than keep the tail
  // it already added.
  it("recounts when the text goes backwards", () => {
    const { result, rerender } = renderHook((text: string) => useTextDirection(text), {
      initialProps: "טיסה עם El Al מ-TLV",
    });
    expect(result.current).toBe("rtl");

    rerender("El Al");
    expect(result.current).toBe("ltr");
  });
});

describe("useTextDirection — under StrictMode", () => {
  // The counts are written during render, and StrictMode renders twice. Not a
  // test that double counting is impossible — it would not show up anyway, since
  // the margin compares the two counts against each other and doubling both
  // leaves the ratio alone. What it checks is that a cache written twice still
  // adds up to what one scan of the finished text says.
  it("survives a double render", () => {
    const text = "טיסה עם El Al מ-TLV ל-NRT דרך Japan Airlines";
    const prefixes = prefixesOf(text);

    const { result, rerender } = renderHook((t: string) => useTextDirection(t), {
      initialProps: prefixes[0] ?? "",
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    for (const p of prefixes.slice(1)) rerender(p);

    expect(result.current).toBe(detectTextDir(text));
  });
});
