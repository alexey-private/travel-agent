type IntlConstructorName = 'DateTimeFormat' | 'NumberFormat' | 'PluralRules' | 'RelativeTimeFormat';

/**
 * Counts how many `Intl.<name>` objects the code under test constructs.
 *
 * A formatter cache is invisible to an assertion on output — ten rows and one
 * row render the same string whether the formatter is reused or rebuilt ten
 * times — so a count is the only thing that can tell the two apart. Pair it
 * with `jest.resetModules()` and a dynamic import so the module builds its
 * formatters again under the counter, and restore in a `finally`.
 *
 * The frontend keeps its own copy for its own formatters: this package must not
 * import from a consumer, and a shared *test* helper would have to ship in the
 * published `dist` to be importable at all.
 */
export function countIntl(name: IntlConstructorName): { count: () => number; restore: () => void } {
  const real = Intl[name] as unknown as new (...args: unknown[]) => object;
  let built = 0;

  (Intl as unknown as Record<string, unknown>)[name] = function (...args: unknown[]) {
    built += 1;
    return new real(...args);
  };

  return {
    count: () => built,
    restore: () => {
      (Intl as unknown as Record<string, unknown>)[name] = real;
    },
  };
}
