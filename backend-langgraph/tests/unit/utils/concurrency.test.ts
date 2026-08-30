import { forEachWithConcurrency } from '@/utils/concurrency';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every microtask and every already-resolved timer settle. */
const settle = () => new Promise((r) => setImmediate(r));

describe('forEachWithConcurrency', () => {
  it('runs every item exactly once', async () => {
    const seen: number[] = [];

    await forEachWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
    });

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps no more than `limit` in flight, and starts the next as one finishes', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const gates = items.map(() => deferred());
    const started: number[] = [];
    let inFlight = 0;
    let peak = 0;

    const run = forEachWithConcurrency(items, 3, async (i) => {
      started.push(i);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gates[i].promise;
      inFlight -= 1;
    });

    await settle();
    // Three workers, three items started. The fourth is not waiting on a socket
    // somewhere — it has not been asked for yet.
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    await settle();
    expect(started).toEqual([0, 1, 2, 3]);

    for (const gate of gates) gate.resolve();
    await run;

    expect(started).toHaveLength(10);
    expect(peak).toBe(3);
  });

  it('lets a slow item delay only its own worker', async () => {
    const slow = deferred();
    const finished: string[] = [];

    const run = forEachWithConcurrency(['slow', 'a', 'b', 'c'], 2, async (item) => {
      if (item === 'slow') await slow.promise;
      finished.push(item);
    });

    await settle();
    expect(finished).toEqual(['a', 'b', 'c']);

    slow.resolve();
    await run;
    expect(finished).toEqual(['a', 'b', 'c', 'slow']);
  });

  it('attempts every item even when some reject, then reports them together', async () => {
    const seen: number[] = [];

    const run = forEachWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      seen.push(n);
      if (n % 2 === 1) throw new Error(`boom ${n}`);
    });

    await expect(run).rejects.toThrow(AggregateError);
    // The two even items ran despite the odd ones failing before them.
    expect(seen.sort()).toEqual([1, 2, 3, 4]);

    await run.catch((err: AggregateError) => {
      expect(err.errors.map((e) => (e as Error).message).sort()).toEqual(['boom 1', 'boom 3']);
      expect(err.message).toBe('2 of 4 failed');
    });
  });

  it('resolves without calling the worker for an empty list', async () => {
    const work = jest.fn();

    await expect(forEachWithConcurrency([], 5, work)).resolves.toBeUndefined();
    expect(work).not.toHaveBeenCalled();
  });

  it('never starts a worker with nothing to do', async () => {
    const seen: string[] = [];

    // A limit above the item count must not walk off the end of the array.
    await forEachWithConcurrency(['only'], 10, async (item) => {
      seen.push(item);
    });

    expect(seen).toEqual(['only']);
  });

  it('refuses a limit below one, which would otherwise hang', async () => {
    await expect(forEachWithConcurrency([1], 0, async () => {})).rejects.toThrow(RangeError);
  });
});
