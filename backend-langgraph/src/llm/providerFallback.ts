import { ModelAbortError } from '@langchain/core/errors';
import { env, type Env } from '../config/env';
import type { Provider } from './createModel';

/**
 * Automatic provider fallback: when the primary LLM provider errors, the same
 * call is retried on the standby one — no env edit, no container restart.
 *
 * The entire policy lives here, so the three call sites carry none of it. Each
 * supplies a `(provider) => Promise<T>` attempt and, where an answer may already
 * be half-streamed, a predicate that vetoes the retry.
 *
 * `Runnable.withFallbacks()` cannot do this job: the JS implementation takes
 * `{ fallbacks }` and nothing else — no error predicate — so it catches aborts
 * too, which is precisely the one error that must not divert.
 */

/**
 * Which env key holds a provider's credential. `keyof Env` for the same reason
 * `PER_PROVIDER_KEY` in createModel.ts is: the lookup goes through an index
 * signature, which would happily swallow a typo or a later rename in env.ts.
 */
const API_KEY_FOR: Record<Provider, keyof Env> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export interface FallbackOptions {
  /** Names the call site in the log — 'reasonNode', 'suggestions', 'memory'. */
  context: string;
  /** The request's abort signal, when it has one. An abort never diverts. */
  signal?: AbortSignal;
  /**
   * The caller's veto: true means this attempt already produced output the user
   * has seen, so retrying would paste a second answer onto a truncated one.
   */
  isUnrecoverablyPartial?: () => boolean;
}

/**
 * When the primary is next worth trying. Module-level on purpose: one process,
 * one breaker. Persisting it across instances is explicitly out of scope — a
 * scaled-out deployment would simply have each instance probe on its own, which
 * is a harmless duplication rather than a wrong answer.
 */
let breakerOpenUntil = 0;

/** Reads a key `env` may not carry at all — see `enabled()` and `cooldownMs()`. */
function readEnv(key: string): unknown {
  return (env as unknown as Record<string, unknown>)[key];
}

/**
 * Absent reads as ON, matching the documented default. `=== true` would be
 * wrong: the two dozen test files that mock `@/config/env` wholesale carry no
 * such key, so the feature would be silently off in every test but the ones
 * written for it, and the suite would prove nothing about the real default.
 */
function enabled(): boolean {
  return readEnv('LLM_FALLBACK_ENABLED') !== false;
}

/**
 * How long the standby is used before the primary is probed again.
 *
 * Absent reads as 0 — no breaker — which cannot happen in production, where zod
 * has already applied the documented default. It is what a test file that mocks
 * `env` without this key gets, and there "no breaker" is the conservative
 * answer: it costs an extra primary attempt, never a wrong provider, and it
 * cannot leak an open window into the next test. Repeating zod's default here
 * would be a second answer to the same question, free to drift from it.
 */
function cooldownMs(): number {
  const raw = readEnv('LLM_FALLBACK_COOLDOWN_MS');
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function breakerIsOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

/**
 * The other provider — or `null` when its API key is unset. No key means no
 * fallback: a call that cannot authenticate would only replace a clear Anthropic
 * error with a confusing OpenAI one.
 */
export function standbyProvider(): Provider | null {
  const standby: Provider = env.LLM_PROVIDER === 'openai' ? 'anthropic' : 'openai';
  const apiKey = readEnv(API_KEY_FOR[standby]);
  return typeof apiKey === 'string' && apiKey.length > 0 ? standby : null;
}

/**
 * An abort surfaces as two different error classes depending on where it is
 * caught: `ModelAbortError` from the model call itself, and a DOMException named
 * `AbortError` when observed through `raceWithSignal`. The signal is checked
 * first because an abort can also reach us disguised as whatever the socket
 * threw on its way down.
 */
export function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (ModelAbortError.isInstance(err)) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Runs `attempt` on the primary provider and, if it fails for a reason worth
 * diverting on, again on the standby.
 *
 * Three failures deliberately do not divert: an abort (the user has already
 * left, and a second full LLM call would be spent inside a budget that has
 * expired), an attempt the caller vetoes as already-streamed, and any failure
 * at all when there is no usable standby. None of them trips the breaker —
 * nothing is wrong with the provider in any of the three.
 */
export async function withProviderFallback<T>(
  attempt: (provider: Provider) => Promise<T>,
  opts: FallbackOptions,
): Promise<T> {
  const primary: Provider = env.LLM_PROVIDER;
  const standby = enabled() ? standbyProvider() : null;

  if (standby && breakerIsOpen()) {
    // Skipping the primary is the whole point of the breaker: a hung provider's
    // connect-and-fail time is spent inside the same 60 s budget /api/chat gives
    // the entire request. The window can only be open because a trip already
    // logged at error level, so this line is by definition a repeat.
    console.warn(`[llm-fallback] ${opts.context}: ${primary} is in cooldown, answering with ${standby}`);
    return attempt(standby);
  }

  try {
    const result = await attempt(primary);
    breakerOpenUntil = 0; // a working primary closes an expired window
    return result;
  } catch (err) {
    if (isAbort(err, opts.signal)) throw err;
    if (opts.isUnrecoverablyPartial?.()) throw err;
    if (!standby) throw err;

    // Open already means a concurrent request tripped it between our attempt
    // starting and failing — its line has been said, ours is the repeat.
    const repeat = breakerIsOpen();
    breakerOpenUntil = Date.now() + cooldownMs();

    const line = `[llm-fallback] ${opts.context}: ${primary} failed, answering with ${standby}`;
    if (repeat) {
      console.warn(line);
    } else {
      // The original error is always attached: it is the only thing that tells
      // "the balance ran out" apart from "our tool schema is malformed", and
      // answering the second one on the standby instead of surfacing it is the
      // trade-off this design knowingly accepts.
      console.error(line, err);
    }

    try {
      return await attempt(standby);
    } catch (standbyErr) {
      console.error(`[llm-fallback] ${opts.context}: ${standby} failed too — no provider left`, standbyErr);
      throw standbyErr;
    }
  }
}

/** Test-only: the breaker is module state and would otherwise leak between tests. */
export function __resetFallbackStateForTests(): void {
  breakerOpenUntil = 0;
}
