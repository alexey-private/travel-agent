import { env } from '../config/env';
import type { Provider } from './createModel';

/**
 * Turns one model recipe into a lookup by provider: the active provider's model
 * built now, the standby's built the first time it is actually asked for.
 *
 * Every call site of `withProviderFallback` needs exactly this and nothing more,
 * and the three of them had begun to keep a copy each. Two rules are what the
 * copies were getting right, and what one copy now guarantees:
 *
 * - **The standby is built on first use, never alongside the primary.** A process
 *   whose provider never fails should never construct a second model at all — no
 *   second HTTP client, and no second API key read in a deployment that has none.
 * - **Both come out of the same recipe.** `build` is a closure over the size and
 *   options, so the standby cannot drift from the primary in max tokens,
 *   streaming, or the tools it is bound to. A second argument list would be a
 *   second place to remember to edit.
 *
 * Generic in the model type because the reasoning node hands over the result of
 * `bindTools`, not a bare `BaseChatModel`, and that type should reach its caller
 * intact.
 */
export function createModelPair<T>(build: (provider: Provider) => T): (provider: Provider) => T {
  const primary = build(env.LLM_PROVIDER);
  let standby: T | null = null;

  return (provider: Provider): T => {
    if (provider === env.LLM_PROVIDER) return primary;
    // No race: there is no await between the check and the assignment, and
    // `build` is synchronous for every caller — `createModel` and `bindTools`
    // both are.
    standby ??= build(provider);
    return standby;
  };
}
