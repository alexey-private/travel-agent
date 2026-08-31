type IntlConstructorName = 'DateTimeFormat' | 'NumberFormat' | 'PluralRules' | 'RelativeTimeFormat';

/**
 * Counts how many `Intl.<name>` objects the code under test constructs.
 *
 * A formatter cache is invisible to an assertion on output — the same string
 * comes back whether the formatter was reused or rebuilt — so a count is the
 * only thing that can tell the two apart. Pair it with `jest.resetModules()`
 * and a dynamic import so construction at module scope is counted too, and
 * restore in a `finally`.
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
