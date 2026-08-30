import type { Locale } from "./config";

/**
 * Memoises one value per locale — in practice, one `Intl` formatter.
 *
 * Building an `Intl.*Format` is where nearly all the cost of formatting lives,
 * and using one is close to free: measured on this project's machine, a
 * `DateTimeFormat` takes ~26 µs to construct and ~0.8 µs to format with. A
 * conversation list that renders fifty timestamps was building fifty identical
 * formatters and throwing each away after a single call.
 *
 * A built formatter is stateless, so sharing one across calls is safe. Entries
 * are built on first use rather than at import: a page pays for the language it
 * is rendering in and not for the other two. The cache cannot grow beyond the
 * number of locales, so nothing has to evict from it.
 */
export function perLocale<T>(build: (locale: Locale) => T): (locale: Locale) => T {
  const cache = new Map<Locale, T>();

  return (locale) => {
    let value = cache.get(locale);
    if (value === undefined) {
      value = build(locale);
      cache.set(locale, value);
    }
    return value;
  };
}
