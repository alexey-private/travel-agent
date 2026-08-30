/**
 * Run `work` over `items`, at most `limit` of them in flight at once.
 *
 * `Promise.all(items.map(work))` starts everything at once, which for anything
 * network-bound means the provider decides how many are too many; a `for … await`
 * loop starts one at a time, which makes the run as long as the sum of its parts.
 * This is the middle: a fixed pool of workers pulling from a shared cursor, so
 * the slowest item delays only its own worker.
 *
 * Items are started in order and finish in whatever order they finish. Nothing
 * is returned — an item's result is whatever `work` does with it.
 *
 * A rejection does not stop the run. Every item is attempted, and the failures
 * are re-thrown together as an `AggregateError` once the pool has drained, so a
 * caller that wants per-item handling can do it inside `work` and a caller that
 * forgets still hears about it.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  if (limit < 1) {
    throw new RangeError(`concurrency limit must be at least 1, got ${limit}`);
  }

  const errors: unknown[] = [];
  let next = 0;

  // One worker per slot, never more than there is work. Each pulls the next
  // index and increments the cursor — safe without a lock because JavaScript
  // does not interleave the two statements, only the `await` below yields.
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await work(item);
      } catch (err) {
        errors.push(err);
      }
    }
  });

  await Promise.all(workers);

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} of ${items.length} failed`);
  }
}
