import { isLocale, type Locale } from "./config";

/**
 * Deriving a first-time visitor's language from the browser.
 *
 * The same preference reaches us two ways: as the `Accept-Language` header on
 * the request, and as `navigator.language(s)` after hydration. Only the header
 * arrives in time to render `<html dir>` on the first paint, which is why the
 * server reads it; `navigator` is the fallback for a header a proxy stripped.
 * Both funnel through `pickLocale` so the two readings cannot drift apart.
 */

/** `iw` is the pre-1989 code for Hebrew, still emitted by some older clients. */
const PRIMARY_SUBTAG_ALIASES: Record<string, Locale> = { iw: "he" };

/**
 * Splits an Accept-Language header into tags, best first.
 *
 * The header is not written in preference order — the q-weights carry it, so
 * `en;q=0.9, he` means Hebrew first. A weight of zero is an explicit refusal
 * and drops the tag entirely, as does a weight we cannot parse.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.tag !== "" && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.tag);
}

/**
 * The first supported locale among an ordered list of BCP-47 tags, or null.
 *
 * Matching is on the primary subtag alone: `he-IL` and `he` are one language
 * here, and a region we do not distinguish must never cost a match.
 */
export function pickLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const primary = tag.split("-")[0]?.toLowerCase();
    if (!primary) continue;
    const candidate = PRIMARY_SUBTAG_ALIASES[primary] ?? primary;
    if (isLocale(candidate)) return candidate;
  }
  return null;
}

/**
 * The browser's own language preference, or null when it names none we support.
 *
 * Null rather than the default locale: the caller has to tell "the browser
 * wants English" from "the browser told us nothing", since only the latter
 * leaves an earlier guess standing.
 */
export function browserLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return pickLocale(tags.filter(Boolean));
}

/**
 * Server-side counterpart: the preference the request itself carries, or null.
 *
 * Null for the same reason `browserLocale` returns it — "asked for English" and
 * "asked for nothing" are different facts, and only the caller knows what to do
 * with the second.
 */
export function acceptLanguageLocale(header: string | null | undefined): Locale | null {
  return pickLocale(parseAcceptLanguage(header));
}
