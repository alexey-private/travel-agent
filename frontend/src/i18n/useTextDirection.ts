"use client";

import { useRef } from "react";
import { countLetters, dirFromCounts, type TextDir } from "./detectTextDir";

/**
 * The direction a message reads, for text that arrives a chunk at a time.
 *
 * `detectTextDir(message.content)` on every render answered the same question
 * from scratch each time, and the question got longer with every chunk: two
 * regex passes over a growing string, once per chunk, is quadratic in the length
 * of the reply. Measured over a stream of one chunk per ~12 characters, that is
 * 16 ms for a 5 KB answer and 1.8 s for a 50 KB one. Counting only the new tail
 * brings those to 0.5 ms and 0.26 s.
 *
 * Still quadratic, and deliberately: what is left is the `startsWith` below,
 * which compares bytes where the old code matched two regexes — measured at
 * between six and forty times cheaper, the gap widening as the string gets
 * shorter. The remaining term is half a millisecond across a whole realistic
 * reply, and buying it out would mean trusting that the text only ever grows
 * rather than checking.
 *
 * The second half is what the user actually sees. A reply opening `# 🇯🇵` holds
 * no letters at all, so the old code called it `ltr` and the bubble
 * left-aligned; the first Hebrew letter then arrived and the whole thing jumped
 * to the right. So while the message is still arriving this returns `undefined`
 * until some letter has come with it — no `dir` attribute, and the bubble
 * inherits the document direction that `<html dir>` already carries from the
 * interface locale. That is a better provisional answer than a fixed `ltr`: a
 * Hebrew interface is where Hebrew replies turn up. It is still only
 * provisional — the text overrules it as soon as the text says anything, which
 * is the rule everywhere else in this app — and it moves the remaining jump onto
 * the rarer pairing, a reply that reads the opposite way from the interface
 * around it.
 *
 * `streaming` is what keeps that confined to the gap it was meant for. A
 * *finished* message with no letters is not waiting for evidence, it is the
 * whole message, and it stays `ltr` exactly as before — otherwise it would have
 * no direction of its own for good, and switching the interface language would
 * re-align a bubble the reader has already read.
 *
 * Give the component a stable key per message. The count belongs to one message;
 * a different one arriving in the same instance is handled, but by recounting.
 */
export function useTextDirection(text: string, streaming = false): TextDir | undefined {
  const cache = useRef({ text: "", rtl: 0, ltr: 0 });

  // Read and written during render on purpose, which is what the rule below is
  // there to catch. This is a cache and not state: what it returns is a pure
  // function of `text`, so a render React throws away cannot leave it wrong, and
  // a second render with the same text finds the work already done rather than a
  // stale answer. Storing it as state instead would re-render on every chunk to
  // report something the same render already knows.
  //
  // The rule taints everything read out of the ref, so it is switched off for
  // the body rather than eight times over, and back on at the closing brace.
  /* eslint-disable react-hooks/refs */
  let { text: counted, rtl, ltr } = cache.current;

  // A streaming message only ever grows, so only the tail is new. `startsWith`
  // is what makes that safe rather than assumed: anything that is not an
  // extension of what was already counted — a different message in a reused
  // instance, or a render React started with older state and threw away — falls
  // back to counting the whole thing. It compares bytes where the alternative
  // matches two regexes — a seventh of the cost, measured — which is what makes
  // it worth paying rather than assuming.
  if (!text.startsWith(counted)) {
    counted = "";
    rtl = 0;
    ltr = 0;
  }

  if (text.length > counted.length) {
    const tail = countLetters(text.slice(counted.length));
    rtl += tail.rtl;
    ltr += tail.ltr;
    cache.current = { text, rtl, ltr };
  }

  const dir = dirFromCounts(rtl, ltr);
  if (dir !== null) return dir;

  // No letter of either script. While the message is still arriving that is a
  // gap in the evidence and the honest answer is to say nothing. Once it has
  // finished it is not a gap but the whole message — an emoji, a price, a room
  // number — and the answer is the one `detectTextDir` has always given, so a
  // finished bubble is left exactly where this change found it.
  return streaming ? undefined : "ltr";
}
/* eslint-enable react-hooks/refs */
