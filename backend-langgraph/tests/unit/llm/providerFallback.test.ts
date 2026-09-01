/**
 * The fallback policy, on its own: which errors divert, which deliberately do
 * not, and what the circuit breaker holds.
 *
 * Deliberately pure — no models, no graph. `attempt` is a `jest.fn()`, so the
 * question "which provider was tried, in what order" is just
 * `attempt.mock.calls`, and every case reads as the sequence it is about.
 *
 * The "breaker not tripped" assertions carry more weight than their size: they
 * are what proves one user closing their tab cannot pin the whole process onto
 * the standby for five minutes.
 */

jest.mock('@/config/env', () => ({ env: {} }));

import { ModelAbortError } from '@langchain/core/errors';
import { env } from '@/config/env';
import {
  isAbort,
  standbyProvider,
  withProviderFallback,
  __resetFallbackStateForTests,
} from '@/llm/providerFallback';

/** The very object the mock factory made, so mutating it is what `env` reads. */
const mutableEnv = env as unknown as Record<string, unknown>;

const COOLDOWN_MS = 300_000;

const BASE = {
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'ant-key',
  OPENAI_API_KEY: 'oai-key',
  LLM_FALLBACK_COOLDOWN_MS: COOLDOWN_MS,
};

function setEnv(values: Record<string, unknown>): void {
  for (const key of Object.keys(mutableEnv)) delete mutableEnv[key];
  Object.assign(mutableEnv, BASE, values);
}

let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  __resetFallbackStateForTests();
  setEnv({});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Asserts the primary was tried first — i.e. the breaker is not holding. */
async function expectPrimaryProbedAgain(): Promise<void> {
  const attempt = jest.fn().mockResolvedValue('ok');
  await withProviderFallback(attempt, { context: 'probe' });
  expect(attempt.mock.calls).toEqual([['anthropic']]);
}

describe('standbyProvider', () => {
  it('is the other provider, whichever one is active', () => {
    expect(standbyProvider()).toBe('openai');

    setEnv({ LLM_PROVIDER: 'openai' });
    expect(standbyProvider()).toBe('anthropic');
  });

  it('is null when the standby has no API key', () => {
    // Spec R10: a call that cannot authenticate would only replace a clear
    // Anthropic error with a confusing OpenAI one.
    setEnv({ OPENAI_API_KEY: undefined });
    expect(standbyProvider()).toBeNull();
  });
});

describe('isAbort', () => {
  it('recognises both abort classes and a pre-aborted signal', () => {
    const domException = new Error('aborted');
    domException.name = 'AbortError';

    expect(isAbort(new ModelAbortError('aborted'))).toBe(true);
    expect(isAbort(domException)).toBe(true);

    const ac = new AbortController();
    ac.abort();
    expect(isAbort(new Error('anything at all'), ac.signal)).toBe(true);

    expect(isAbort(new Error('credit balance is too low'))).toBe(false);
  });
});

describe('withProviderFallback', () => {
  it('tries the primary alone when it succeeds', async () => {
    const attempt = jest.fn().mockResolvedValue('from anthropic');

    await expect(withProviderFallback(attempt, { context: 'test' })).resolves.toBe(
      'from anthropic',
    );

    expect(attempt.mock.calls).toEqual([['anthropic']]);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('diverts to the standby on any error, loudly and with the error attached', async () => {
    const outage = new Error('credit balance is too low');
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(outage)
      .mockResolvedValueOnce('from openai');

    await expect(withProviderFallback(attempt, { context: 'reasonNode' })).resolves.toBe(
      'from openai',
    );

    expect(attempt.mock.calls).toEqual([['anthropic'], ['openai']]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line, attached] = errorSpy.mock.calls[0];
    expect(line).toContain('[llm-fallback]');
    expect(line).toContain('reasonNode');
    expect(line).toContain('anthropic');
    expect(line).toContain('openai');
    // The original error is the only thing that tells "the balance ran out"
    // apart from "our tool schema is malformed".
    expect(attached).toBe(outage);
  });

  it("propagates the standby's own error when both providers fail", async () => {
    const primaryErr = new Error('anthropic is down');
    const standbyErr = new Error('openai is down too');
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(primaryErr)
      .mockRejectedValueOnce(standbyErr);

    await expect(withProviderFallback(attempt, { context: 'test' })).rejects.toBe(standbyErr);

    expect(attempt.mock.calls).toEqual([['anthropic'], ['openai']]);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('does not divert when the caller vetoes the retry', async () => {
    // Spec R3: tokens are already on the SSE wire and the frontend appends,
    // so a second complete answer would be pasted onto a truncated one.
    const midStream = new Error('connection reset');
    const attempt = jest.fn().mockRejectedValue(midStream);

    await expect(
      withProviderFallback(attempt, {
        context: 'reasonNode',
        isUnrecoverablyPartial: () => true,
      }),
    ).rejects.toBe(midStream);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    // Nothing is wrong with the provider, so the breaker must not hold.
    await expectPrimaryProbedAgain();
  });

  it('does not divert on a ModelAbortError', async () => {
    const attempt = jest.fn().mockRejectedValue(new ModelAbortError('aborted'));

    await expect(withProviderFallback(attempt, { context: 'test' })).rejects.toBeInstanceOf(
      ModelAbortError,
    );

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    await expectPrimaryProbedAgain();
  });

  it("does not divert on a DOMException-shaped 'AbortError'", async () => {
    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';
    const attempt = jest.fn().mockRejectedValue(aborted);

    await expect(withProviderFallback(attempt, { context: 'test' })).rejects.toBe(aborted);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    await expectPrimaryProbedAgain();
  });

  it('does not divert when the signal is already aborted', async () => {
    // The error itself carries no abort marker here — only the signal knows.
    const ac = new AbortController();
    ac.abort();
    const failure = new Error('socket closed');
    const attempt = jest.fn().mockRejectedValue(failure);

    await expect(
      withProviderFallback(attempt, { context: 'test', signal: ac.signal }),
    ).rejects.toBe(failure);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    await expectPrimaryProbedAgain();
  });

  it('skips the primary entirely while the breaker is open', async () => {
    // Spec R7: a hung primary's connect-and-fail time is spent inside the same
    // 60 s budget /api/chat gives the whole request.
    const first = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('a');
    await withProviderFallback(first, { context: 'test' });

    const second = jest.fn().mockResolvedValue('b');
    await expect(withProviderFallback(second, { context: 'test' })).resolves.toBe('b');

    expect(second.mock.calls).toEqual([['openai']]);
  });

  it('shouts once, then says the cooldown skips at warn', async () => {
    const first = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('a');
    await withProviderFallback(first, { context: 'test' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    // These two take the skip-the-primary branch, not the failure branch: the
    // breaker is already open, so their attempts never reach Anthropic at all.
    await withProviderFallback(jest.fn().mockResolvedValue('b'), { context: 'test' });
    await withProviderFallback(jest.fn().mockResolvedValue('c'), { context: 'test' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('logs a second, overlapping trip at warn rather than a second error', async () => {
    // The only path to the repeat branch of the trip itself. Once the breaker
    // holds, later requests skip the primary entirely — so a repeat trip can
    // only come from two requests whose primary attempts were already in flight
    // when the first of them failed. Both calls therefore have to be started
    // before either is awaited.
    const attempt = jest.fn().mockImplementation(async (provider: string) => {
      if (provider === 'anthropic') throw new Error('down');
      return 'from openai';
    });

    const results = await Promise.all([
      withProviderFallback(attempt, { context: 'test' }),
      withProviderFallback(attempt, { context: 'test' }),
    ]);

    expect(results).toEqual(['from openai', 'from openai']);
    // Two Anthropic attempts is what proves neither call took the skip branch —
    // with the skip branch there would be one, and the log counts would agree
    // for the wrong reason.
    expect(attempt.mock.calls.filter(([p]) => p === 'anthropic')).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('closes an open window as soon as the primary itself answers again', async () => {
    const tripping = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('a');
    await withProviderFallback(tripping, { context: 'test' });

    // Take the standby away, so the primary is attempted despite the window
    // being open — and let it succeed.
    setEnv({ OPENAI_API_KEY: undefined });
    const recovered = jest.fn().mockResolvedValue('ok');
    await withProviderFallback(recovered, { context: 'test' });
    expect(recovered.mock.calls).toEqual([['anthropic']]);

    // Restoring the standby key must not resurrect a window the primary has
    // already answered through.
    setEnv({});
    const next = jest.fn().mockResolvedValue('ok');
    await withProviderFallback(next, { context: 'test' });
    expect(next.mock.calls).toEqual([['anthropic']]);
  });

  it('probes the primary again once the cooldown has elapsed', async () => {
    jest.useFakeTimers();

    const first = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('a');
    await withProviderFallback(first, { context: 'test' });

    const duringCooldown = jest.fn().mockResolvedValue('b');
    await withProviderFallback(duringCooldown, { context: 'test' });
    expect(duringCooldown.mock.calls).toEqual([['openai']]);

    jest.advanceTimersByTime(COOLDOWN_MS);

    // Spec R8: recovery needs no human — nobody edits or restarts anything.
    const afterCooldown = jest.fn().mockResolvedValue('c');
    await withProviderFallback(afterCooldown, { context: 'test' });
    expect(afterCooldown.mock.calls).toEqual([['anthropic']]);
  });

  it('never holds the breaker when the cooldown is 0', async () => {
    setEnv({ LLM_FALLBACK_COOLDOWN_MS: 0 });

    const first = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('a');
    await withProviderFallback(first, { context: 'test' });

    const second = jest.fn().mockResolvedValue('b');
    await withProviderFallback(second, { context: 'test' });

    expect(second.mock.calls).toEqual([['anthropic']]);
  });

  it('makes no standby attempt when the kill switch is off', async () => {
    setEnv({ LLM_FALLBACK_ENABLED: false });
    const outage = new Error('credit balance is too low');
    const attempt = jest.fn().mockRejectedValue(outage);

    await expect(withProviderFallback(attempt, { context: 'test' })).rejects.toBe(outage);

    expect(attempt.mock.calls).toEqual([['anthropic']]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('treats an absent kill switch as enabled', async () => {
    // The 24 test files that mock `env` wholesale carry no such key. Reading
    // `=== true` would silently disable the feature in every one of them, and
    // the suite would then prove nothing about the documented default.
    expect(mutableEnv.LLM_FALLBACK_ENABLED).toBeUndefined();

    const attempt = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');
    await expect(withProviderFallback(attempt, { context: 'test' })).resolves.toBe('ok');

    expect(attempt.mock.calls).toEqual([['anthropic'], ['openai']]);
  });

  it('makes no standby attempt when the standby has no API key', async () => {
    setEnv({ OPENAI_API_KEY: undefined });
    const outage = new Error('credit balance is too low');
    const attempt = jest.fn().mockRejectedValue(outage);

    await expect(withProviderFallback(attempt, { context: 'test' })).rejects.toBe(outage);

    expect(attempt.mock.calls).toEqual([['anthropic']]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
