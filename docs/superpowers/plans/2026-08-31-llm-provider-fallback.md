# Automatic LLM provider fallback — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the primary LLM provider errors, the same call is retried on the
standby provider automatically — no env edit, no container restart. An outage
becomes a few minutes of lower-quality answers instead of a dead product.

**Spec:** [2026-08-31-llm-provider-fallback.md](../specs/2026-08-31-llm-provider-fallback.md)

**Architecture:** One engine, `withProviderFallback`, holds the entire policy —
which errors divert (any, minus aborts, minus attempts that already produced
output), a per-process circuit breaker, and the logging. The three call sites
carry none of it: each one supplies a `(provider) => Promise<T>` attempt and, in
the streaming case, a predicate that vetoes the retry. Model ids stop being
resolved against the *active* provider and become a pure function of
`(provider, size)`, so a standby can be constructed at all.

**Tech Stack:** LangChain v1 (`@langchain/core`, `@langchain/anthropic`,
`@langchain/openai`), LangGraph, zod, Jest + ts-jest.

---

## Global Constraints

Apply to **every** task below.

- **`backend-langgraph/` is the only backend.** Nothing here touches `frontend/`
  or `backend-telegram/` source; T6 touches shared docs only.
- **After every task**, both checks, from the worktree root:
  ```bash
  npx tsc -p backend-langgraph/tsconfig.json --noEmit
  TEST_DATABASE_URL="postgresql://user:password@localhost:5433/travel_agent_test" \
    npm run test:all --workspace=backend-langgraph
  ```
  Port **5433**, not 5432 — on 5432 the integration tests skip silently.
- **After every task, `/code-review`**, reporting both axes (Standards / Spec).
  Green tests do not substitute for it.
- **After every task, stop and report.** Do not chain T1 into T2.
- **No commits without explicit permission.** Steps that would commit state the
  command and wait.
- **No schema changes.** This feature stores nothing; it adds no migration.
- Tool-facing strings (`src/tools/**`) are untouched — none of this reaches them.

---

## Three corrections to the approved design

Found while reading the code, before writing any. They change what T1 and T2 do.

### 1. `env.MODEL_IDS` as a parsed nested object would break 24 test files

24 test files mock the env module wholesale:

```ts
jest.mock('@/config/env', () => ({ env: { LLM_PROVIDER: 'anthropic', REASONING_MODEL: '…', … } }));
```

Those literals contain only the keys that exist today. A factory reading
`env.MODEL_IDS[provider][size]` would hit `undefined[…]` in every one of them, and
"add a key to 24 mocks" is a change that silently rots the moment a 25th is
written.

**Instead:** the ids are resolved by a function at call time, not baked into `env`
at parse time. `env` gains only flat optional strings, which a mock that omits
them simply leaves `undefined` — and the resolver then falls through to exactly
today's behaviour. No existing mock is edited.

### 2. `LLM_FALLBACK_ENABLED` must read as enabled when the key is absent

Same reason: in those 24 mocks the key does not exist. If the engine tests
`env.LLM_FALLBACK_ENABLED === true`, `undefined` silently disables the feature in
every test but the ones written for it — and the suite would then prove nothing
about the default. The engine reads `!== false`, so absent means on, matching the
documented default.

The consequence is real and must be checked rather than assumed away: with the
feature on by default, an **existing** test whose Anthropic mock rejects will now
attempt OpenAI too. Where that changes an assertion, the fix is to make that
test's intent explicit (reject on both providers, or set the flag off in its
mock) — never to flip the default to make the suite quiet.

### 3. The worktree has no `node_modules`

`npm ci` has never run in this worktree; the packages are hoisted to the main
checkout's root, which this tree does not share. Nothing can be typechecked or
tested until T0.

---

### Task 0: Make the worktree runnable

**Files:** none — environment only.

- [x] **Step 1: Install**

```bash
npm ci
```

Root install; npm workspaces links all four packages and the root `postinstall`
compiles `shared/i18n` into `dist`, which `backend-langgraph` imports.

- [x] **Step 2: Establish the baseline is green *before* any edit**

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5433/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

Record the pass/fail counts. Every later task compares against this number, not
against zero — a suite that was already red would otherwise be blamed on T1.

If the integration tests report as skipped, the test database on 5433 is not up:
`docker compose up -d` first.

---

### Task 1: Per-provider model ids, and `createModel(size, opts, provider)`

**Why first:** today `MODEL_DEFAULTS` is indexed by the *active* provider, so
`env.REASONING_MODEL` holds `claude-sonnet-4-6` whenever `LLM_PROVIDER=anthropic`.
A standby reading it would ask OpenAI for a Claude model. Until this is fixed
there is no standby to fall back *to*. It also touches nothing that currently
runs, so a mistake here is loud and cheap.

**Files:**
- Modify: `backend-langgraph/src/config/env.ts`
- Modify: `backend-langgraph/src/llm/createModel.ts`
- Create: `backend-langgraph/tests/unit/llm/createModel.test.ts`

**Interfaces:**
```ts
// src/llm/createModel.ts
export type Provider = 'anthropic' | 'openai';
export function modelId(provider: Provider, size: ModelSize): string;
export function createModel(
  size: ModelSize,
  maxTokensOrOptions?: number | ModelOptions,
  provider?: Provider,          // defaults to env.LLM_PROVIDER
): BaseChatModel;
```

**Resolution order** for `modelId(provider, size)`, highest first:

1. `ANTHROPIC_REASONING_MODEL` / `ANTHROPIC_FAST_MODEL` / `OPENAI_REASONING_MODEL` /
   `OPENAI_FAST_MODEL` — new, per-provider, always win.
2. `REASONING_MODEL` / `FAST_MODEL` — existing, and **only when `provider ===
   env.LLM_PROVIDER`**. This clause is what keeps every current deployment and
   every current test mock meaning exactly what it means today.
3. `MODEL_DEFAULTS[provider][size]` — the values already in the file, unchanged.

- [x] **Step 1: Write the failing test**

Create `backend-langgraph/tests/unit/llm/createModel.test.ts`. Mock both provider
packages and the env module; assert on the `model` field of the constructor
argument. Vary the env between cases with `jest.isolateModules` + `require`, as
`tests/unit/config/env.test.ts` already does.

Cases:

```
- omitting the provider argument reproduces today's behaviour exactly
    LLM_PROVIDER=anthropic, REASONING_MODEL='claude-sonnet-4-6'
    createModel('full')                      → ChatAnthropic, model 'claude-sonnet-4-6'
- a standby never receives the active provider's id            ← the bug being fixed
    LLM_PROVIDER=anthropic, REASONING_MODEL='claude-sonnet-4-6'
    createModel('full', undefined, 'openai') → ChatOpenAI,   model 'gpt-4o'
- the per-provider key wins over the generic one
    OPENAI_FAST_MODEL='gpt-4o-mini-2026'
    createModel('fast', undefined, 'openai') → model 'gpt-4o-mini-2026'
- the generic key does not leak across providers
    LLM_PROVIDER=openai, FAST_MODEL='gpt-4o-mini'
    createModel('fast', undefined, 'anthropic') → 'claude-haiku-4-5-20251001'
- a mock env carrying none of the new keys still resolves both providers
    { LLM_PROVIDER: 'anthropic', REASONING_MODEL, FAST_MODEL } only
    → anthropic gets the mock's ids, openai gets the built-in defaults
- provider-specific construction details stay on their own branch
    anthropic → clientOptions.defaultHeaders['anthropic-beta'] set, topP undefined
    openai    → no anthropic-beta header
```

The last case is the regression guard for the `topP = -1` sentinel fix and the
PDF beta header: both are Anthropic-only and must not migrate to the shared path
while the branches are being rewritten.

- [x] **Step 2: Confirm it fails**

```bash
npx jest tests/unit/llm/createModel.test.ts --rootDir backend-langgraph
```

Expected: FAIL — `createModel` takes two arguments and the OpenAI ids are
hardcoded.

- [x] **Step 3: Extend the env schema**

In `src/config/env.ts`, inside `envSchema`, next to the existing AI block:

```ts
  // Per-provider model ids. The existing REASONING_MODEL / FAST_MODEL keep their
  // meaning — they apply to the ACTIVE provider only — so nothing deployed
  // changes; these exist because a standby provider needs ids of its own, and
  // asking OpenAI for `claude-sonnet-4-6` is the failure they prevent.
  ANTHROPIC_REASONING_MODEL: z.string().optional(),
  ANTHROPIC_FAST_MODEL: z.string().optional(),
  OPENAI_REASONING_MODEL: z.string().optional(),
  OPENAI_FAST_MODEL: z.string().optional(),

  // z.coerce.boolean() cannot express this: Boolean('false') === true, which
  // would make the kill switch impossible to turn off.
  LLM_FALLBACK_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  LLM_FALLBACK_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(300_000),
```

`MODEL_DEFAULTS` moves out of `env.ts` and into `createModel.ts` — it is the
factory's business, and leaving a copy behind is how the two would drift.

**Corrected while implementing:** an earlier draft of this step also said the
`env.REASONING_MODEL` / `env.FAST_MODEL` export block at the bottom of `env.ts`
stays exactly as it is. It cannot: that block computes its defaults *from*
`MODEL_DEFAULTS`, so the two instructions are incompatible. The block goes, and
`env` becomes `parseResult.data` — the two keys are now plain
`string | undefined`, and all defaulting happens once, in `modelId()`. Verified
safe: `modelId()` is the only reader of either key anywhere in the repo, and every
test mock that supplies them also pins `LLM_PROVIDER: 'anthropic'`, so
`modelId`'s `provider === env.LLM_PROVIDER` clause returns exactly what those
mocks returned before. Keeping the block would have meant two places answering
"which id for this provider", free to drift — which is the very thing moving
`MODEL_DEFAULTS` was meant to prevent.

One behaviour genuinely changes, and it is a fix: under `LLM_PROVIDER=openai` the
old factory hardcoded `gpt-4o` / `gpt-4o-mini` and **ignored** a `REASONING_MODEL`
set in the environment, contradicting the spec's own description of those keys as
applying to the active provider. They are now honoured. Production runs
`anthropic`, so nothing deployed is affected.

- [x] **Step 4: Rewrite the factory**

`src/llm/createModel.ts`:

```ts
export type Provider = 'anthropic' | 'openai';

const MODEL_DEFAULTS: Record<Provider, Record<ModelSize, string>> = {
  anthropic: { full: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5-20251001' },
  openai:    { full: 'gpt-4o',            fast: 'gpt-4o-mini' },
};

const PER_PROVIDER_KEY = {
  anthropic: { full: 'ANTHROPIC_REASONING_MODEL', fast: 'ANTHROPIC_FAST_MODEL' },
  openai:    { full: 'OPENAI_REASONING_MODEL',    fast: 'OPENAI_FAST_MODEL' },
} as const;

/**
 * Which model id a given provider uses for a given size — a pure function of the
 * pair, deliberately not of the *active* provider. Reading env.REASONING_MODEL
 * for a standby is how a fallback ends up asking OpenAI for a Claude model.
 *
 * The generic REASONING_MODEL / FAST_MODEL are honoured only for the active
 * provider, which is what they have always meant; nothing deployed changes.
 */
export function modelId(provider: Provider, size: ModelSize): string {
  const specific = (env as Record<string, unknown>)[PER_PROVIDER_KEY[provider][size]];
  if (typeof specific === 'string' && specific) return specific;
  if (provider === env.LLM_PROVIDER) {
    const generic = size === 'full' ? env.REASONING_MODEL : env.FAST_MODEL;
    if (generic) return generic;
  }
  return MODEL_DEFAULTS[provider][size];
}
```

`createModel` gains `provider: Provider = env.LLM_PROVIDER` as a third parameter,
branches on that parameter instead of on `env.LLM_PROVIDER`, and takes both ids
from `modelId(provider, size)`. The `anthropic-beta` header and the `topP`
sentinel fix stay inside the Anthropic branch.

- [x] **Step 5: Green, then the whole suite**

```bash
npx jest tests/unit/llm/createModel.test.ts --rootDir backend-langgraph
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5433/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

The suite must match T0's baseline exactly. Any file that mocks env and now fails
is telling you the "no existing mock is edited" claim was wrong — investigate
before touching the mock.

- [x] **Step 6: `/code-review`, report both axes, stop.**

---

### Task 2: The fallback engine

**Files:**
- Create: `backend-langgraph/src/llm/providerFallback.ts`
- Create: `backend-langgraph/tests/unit/llm/providerFallback.test.ts`

Still touches nothing that runs — the module has no callers until T3.

**Interfaces:**
```ts
export function standbyProvider(): Provider | null;
export function isAbort(err: unknown, signal?: AbortSignal): boolean;

export interface FallbackOptions {
  /** Names the call site in the log — 'reasonNode', 'suggestions', 'memory'. */
  context: string;
  signal?: AbortSignal;
  /** Caller's veto: true = this attempt already produced output, do not retry. */
  isUnrecoverablyPartial?: () => boolean;
}
export function withProviderFallback<T>(
  attempt: (provider: Provider) => Promise<T>,
  opts: FallbackOptions,
): Promise<T>;

/** Test-only: clears the breaker and the log dedup. */
export function __resetFallbackStateForTests(): void;
```

**Behaviour, in order:**

1. `enabled()` — `env.LLM_FALLBACK_ENABLED !== false`. Absent reads as on
   (correction 2 above).
2. `standbyProvider()` — the other provider, **or `null` when its API key is
   unset**. No key means no fallback: a call that cannot authenticate would only
   replace a clear Anthropic error with a confusing OpenAI one (spec R10).
3. Breaker open and `Date.now() < breakerOpenUntil` → attempt the **standby
   first** and skip the primary entirely. This is the whole point of R7: a hung
   primary's connect-and-fail time is spent inside the same 60 s abort budget
   `/api/chat` gives the whole request.
4. Otherwise attempt the primary. On success, return; if the breaker was open and
   has expired, this success closes it.
5. On failure: if `isAbort(err, opts.signal)` → **rethrow**, no log, breaker not
   tripped. If `opts.isUnrecoverablyPartial?.()` → **rethrow**, no log, breaker
   not tripped — the request is unrecoverable, but nothing is wrong with the
   provider. If no standby → rethrow. If disabled → rethrow.
6. Otherwise: trip the breaker for `LLM_FALLBACK_COOLDOWN_MS`, log, attempt the
   standby. A standby failure is logged at error and **its own** error
   propagates.

`LLM_FALLBACK_COOLDOWN_MS=0` means the breaker never holds — the primary is
retried on every request.

**Logging (spec R6).** This package has no logger module: routes use Fastify's
pino via `req.log`, non-route code uses `console.*`. This is non-route code.

```
console.error('[llm-fallback] <primary> failed, answering with <standby> …', err)
```

once per open breaker window; repeats inside the window at `console.warn` so a
busy minute cannot bury the first line. The original error is always attached —
it is the only thing that distinguishes "the balance ran out" from "our tool
schema is malformed", which is the trade-off the spec accepts.

**`isAbort` takes two classes, not one:**

```ts
import { ModelAbortError } from '@langchain/core/errors';   // verified: dist/errors/index.d.ts:84

export function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (ModelAbortError.isInstance(err)) return true;
  return err instanceof Error && err.name === 'AbortError';
}
```

- [x] **Step 1: Write the failing test**

`tests/unit/llm/providerFallback.test.ts` — pure, no graph, no models. The
`attempt` callback is a `jest.fn()`, so "which provider was tried" is just
`attempt.mock.calls`.

```
- primary succeeds        → attempt called once with the primary, nothing logged
- primary throws          → attempt called twice, second with the standby, one console.error
- both throw              → the STANDBY's error propagates, two error logs
- isUnrecoverablyPartial  → rethrown, attempt called once, nothing logged, breaker untripped
- ModelAbortError         → rethrown, once, unlogged, untripped
- name === 'AbortError'   → rethrown, once, unlogged, untripped
- pre-aborted signal      → rethrown, once, unlogged, untripped   (attempt itself rejects)
- breaker open            → the FIRST attempt is the standby; the primary is not tried
- breaker expiry          → after jest.advanceTimersByTime(cooldown), the primary is tried again
- cooldown 0              → the primary is tried on every call
- LLM_FALLBACK_ENABLED=false → rethrown, one attempt, no standby
- standby key unset       → rethrown, one attempt, no standby
- repeat inside a window  → console.error once, console.warn thereafter
```

Fake timers (`jest.useFakeTimers()`) for the breaker cases;
`__resetFallbackStateForTests()` in `beforeEach`, since the breaker is
module-level and would otherwise leak between tests.

The "breaker untripped" assertions matter more than they look: they are what
proves a user closing their tab cannot pin the whole process onto the standby for
five minutes.

- [x] **Step 2: Confirm it fails** — module does not exist.
- [x] **Step 3: Implement `src/llm/providerFallback.ts`.**
- [x] **Step 4: Green + full suite + tsc.**
- [x] **Step 5: `/code-review`, report both axes, stop.**

---

### Task 3: The streaming call site

**Files:**
- Modify: `backend-langgraph/src/graph/nodes/reasonNode.ts`
- Modify: `backend-langgraph/tests/unit/graph/reasonNode.test.ts`

Alone, because this is the one place a mistake regresses something that works:
get the config handling wrong and **text stops reaching the browser**, with every
test still green because the tests watch what `invoke` was handed, not what the
user sees.

**The change:**

```ts
return async (state: AgentStateType, config?: RunnableConfig) => {
  const sysContent: ContentBlock[] = [{ type: 'text', text: buildSystemPrompt(state), cache_control: { type: 'ephemeral' } }];
  const messages = [new SystemMessage({ content: sysContent }), ...state.messages];
  let streamed = false;

  const response = await withProviderFallback(
    async (provider) => {
      streamed = false;                                    // fresh per attempt
      const m = provider === env.LLM_PROVIDER ? model : standby();
      // mergeConfigs ADDS to the callback manager LangGraph gave us. ensureConfig
      // would REPLACE `callbacks`, detaching this run from streamEvents — the
      // text would silently stop reaching the browser.
      const cfg = mergeConfigs(config, {
        callbacks: [{ handleLLMNewToken: () => { streamed = true; } }],
      });
      return m.invoke(messages, cfg);
    },
    { context: 'reasonNode', signal: config?.signal, isUnrecoverablyPartial: () => streamed },
  );

  return { messages: [response] };
};
```

Two details that are load-bearing:

- **`streamed` lives in the per-invocation closure**, not on the node. The model
  is a singleton shared by concurrent requests; a flag anywhere outside this
  closure would let one user's stream veto another user's retry.
- **The standby is built lazily and memoised**, with the *same* `tools` array
  bound (spec R5). Lazily because the existing test
  `'creates the model once in the closure, not per invocation'` counts
  `ChatAnthropic` constructions, and because a process that never fails should
  never construct a second model at all.

The Anthropic-only `cache_control: { type: 'ephemeral' }` rides along to OpenAI
unchanged: verified tolerated by `ChatOpenAI` on 2026-08-31, and a per-provider
prompt path is a second prompt to keep in sync for no benefit.

> **Wrong, and corrected in Task 7 (2026-09-01).** The verification was real and
> the conclusion still false: `ChatOpenAI` tolerates the key under `role: "system"`,
> which is what it uses for gpt-4o and not for gpt-5.x. The ride-along pinned the
> standby to the gpt-4 family. See spec R12.

- [x] **Step 1: Extend the test file**

Give `ChatOpenAI` a real mock with its own `bindTools` → `invoke` spy, so a test
can prove *which* provider answered. New cases:

```
- primary rejects → the OpenAI spy answered, and the returned message is its reply
- the standby was bound with the same tools array the primary was
- the standby is not constructed at all when the primary succeeds  (lazy)
- an attempt that fired handleLLMNewToken before rejecting is NOT retried
- an abort is not retried
- the config passed to invoke still carries the parent callbacks   (mergeConfigs, not ensureConfig)
```

The fourth case is the whole of R3, and the only way to write it is to have the
Anthropic mock's `invoke` reach into the `config` it was handed and call
`handleLLMNewToken` before it rejects — i.e. the test must exercise the real
callback plumbing, not a stubbed flag.

The existing `'creates the model once in the closure'` test must pass
**untouched**. If it needs editing, the standby is not lazy.

- [x] **Step 2: Confirm the new cases fail.**
- [x] **Step 3: Implement.**
- [x] **Step 4: Green + full suite + tsc.** Watch `travelGraph.test.ts` and
      `shoppingGraph.test.ts` in particular — they build real nodes.
- [x] **Step 5: `/code-review`, report both axes, stop.**

---

### Task 4: The two `'fast'` call sites

**Files:**
- Modify: `backend-langgraph/src/services/SuggestionService.ts`
- Modify: `backend-langgraph/src/services/MemoryService.ts`
- Modify: `backend-langgraph/tests/unit/services/SuggestionService.test.ts`
- Modify: `backend-langgraph/tests/unit/services/MemoryService.test.ts`

Mechanical once T2 exists, and no streaming concern — both are plain `.invoke()`.

> **Deviation, taken during implementation.** This task planned "a lazily built,
> memoised standby *inside each service*", which would have made three
> hand-written copies of the same six-line rule counting T3's. They were
> extracted instead into `backend-langgraph/src/llm/modelPair.ts`
> (`createModelPair`, with its own test file), and T3's `reasonNode` was
> retrofitted onto it — one file outside this task's declared scope, changed
> without altering its behaviour (T3's tests pass untouched). The helper is also
> what makes the standby provably unable to drift from the primary in size,
> max tokens or bound tools: both come out of one closure rather than two
> argument lists.
Both matter because both already swallow their errors (`return []`,
`console.warn`), so during the 2026-08-31 outage they were down and *silent*;
covering only the chat would leave that half of the failure invisible (spec R4).

**The change,** identical in both: a lazily built, memoised standby `'fast'`
model, and `withProviderFallback` around the existing `invoke`, inside the
existing `try`. The outer `try/catch` **stays** — if both providers are down the
degraded behaviour is unchanged, it is merely now preceded by a loud log instead
of a silent one.

- [x] **Step 1: Extend both test files**

```
- primary rejects → the standby answers, and its JSON is parsed as before
- both reject     → today's behaviour ([] / a console.warn), preceded by console.error
- the standby is not constructed when the primary succeeds
```

- [x] **Step 2–4:** fail → implement → green + full suite + tsc.
- [x] **Step 5: `/code-review`, report both axes, stop.**

---

### Task 5: Adjacent — abort classification in `/api/chat`

**Adjacent rather than part of the feature** — it was written as optional, and
**confirmed in on 2026-08-31**, so T6 documents it as shipped. Dropping it would
change nothing else in this plan.

**Files:**
- Modify: `backend-langgraph/src/routes/chat.ts`
- Modify: `backend-langgraph/tests/unit/routes/chat.p0.test.ts`

[chat.ts](../../../backend-langgraph/src/routes/chat.ts) classifies aborts with
`err.name === 'AbortError'` alone, which does not recognise `ModelAbortError`. A
client that disconnects mid-answer is therefore logged as `agent error` and sent
`code: 'agent_failed'` down a socket that is already gone. Pre-existing, unrelated
to the fallback, and answered by the classifier T2 already built.

- [x] **Step 1:** a failing test — a `ModelAbortError` thrown from the graph with
      `timedOut === false` produces no `error` SSE event and no `log.error`.
- [x] **Step 2:** replace the inline check with `isAbort(err, ac.signal)`.
      Keep the `timedOut` branch as-is: a timeout must still tell the user.
- [x] **Step 3:** green + full suite + tsc, `/code-review`, stop.

> **Added during implementation, beyond the three steps above.** The spec review
> pointed out that the `timedOut` branch this task is told to "keep as-is" had no
> test at all — and that the change makes the branch *more* reachable, since
> `isAbort` now answers yes on a timeout unconditionally rather than only when
> the thrown error happened to be named `AbortError`. So the change above could
> have silenced the timeout as well and every suite would still have been green.
> A regression test was added in the same file: the graph hangs until the route's
> own 60 s timer fires, and the response must carry `request_timed_out` and a
> warning rather than silence or an error line. Mutation-checked — disabling the
> branch fails that test and nothing else.

---

### Task 6: Docs, env samples, memory, and the live check

**Files:**
- Modify: `.env.example`
- Modify: `DEPLOYMENT.md` — the per-service Railway env table
- Modify: `AGENTS.md` — the `Environment Variables` block, plus a new short
  section next to the existing provider notes
- Modify: `memory/project_llm_provider_fallback.md` and the `MEMORY.md` index line

- [x] **Step 1: The six new variables** into `.env.example`, `DEPLOYMENT.md` and
      `AGENTS.md`, with their defaults. Note in `DEPLOYMENT.md` that
      `OPENAI_API_KEY` is now load-bearing for the backend service and not only
      for `/api/transcribe` — someone pruning it as "the Whisper key" would
      silently remove the standby.

- [x] **Step 2: An `AGENTS.md` section** — what diverts, what deliberately does
      not (aborts, post-first-token failures), why the breaker exists, and the
      `mergeConfigs`-not-`ensureConfig` trap, which is the one thing here that
      fails silently and invisibly.

- [x] **Step 3: The live forced-failure check.** The production failure is not
      reproducible on demand any more — the balance was topped up the same day —
      so force it locally. This is the only step that exercises the real SSE path
      end to end; the unit tests all mock the provider packages.

  1. `docker compose up -d`; start the backend with `ANTHROPIC_API_KEY` set to an
     invalid key and a valid `OPENAI_API_KEY`.
  2. Send a message from `http://localhost:3000`. Expect a normal streamed
     answer, with tool calls and follow-up suggestions, and exactly one
     error-level `[llm-fallback]` line naming both providers.
  3. Send a second message inside the cooldown. Expect no second Anthropic
     attempt in the log, and an answer.
  4. Restore the key, wait out `LLM_FALLBACK_COOLDOWN_MS`, send a third. Expect
     Anthropic to answer, with no fallback line.
  5. Start a long answer and close the tab mid-stream. Expect **no**
     `[llm-fallback]` line and no second LLM call.

  Step 5 is the one that cannot be faked: it is the difference between a fallback
  and a machine that answers every abandoned request twice.

  > **Ran 2026-09-01. All five pass; three deviations from the script above, none
  > of which weaken it.**
  >
  > *Postgres was already up on 5432, so `docker compose up -d` was a no-op.* The
  > backend ran on port 3010 from `tsx src/index.ts`, and the client was `curl -sN`
  > against `/api/chat` rather than the browser — the SSE route is the same one the
  > frontend calls, and a killable client is what makes step 5 possible at all.
  >
  > *Step 3 needed a longer window than the default script implies.* At
  > `LLM_FALLBACK_COOLDOWN_MS=20000` every request re-probed Anthropic and produced
  > a fresh error-level line — because each answer takes ~20 s of tool calls, so
  > consecutive requests landed 24–27 s apart, outside the window. That is correct
  > behaviour and indistinguishable at a glance from a breaker that does not work.
  > At 120 s the second request logged
  > `[llm-fallback] reasonNode: anthropic is in cooldown` with no
  > `AuthenticationError` anywhere in it — no Anthropic attempt, and an answer.
  >
  > *Step 4 was split in two, because restoring the key needs a restart and a
  > restart resets the breaker anyway — and the two halves prove different things.*
  > **Unattended recovery** is established by the 20 s run alone: four consecutive
  > requests each landed after the window had expired and each re-probed Anthropic,
  > producing a fresh error-level line rather than `is in cooldown`. Nobody touched
  > the process between them. **A healthy primary answering with zero
  > `[llm-fallback]` lines** was verified separately, after restarting with the real
  > key — and that restart is a human action, so this half says nothing about
  > unattended recovery and must not be read as if it did. Together they cover the
  > acceptance criterion; neither does on its own.
  >
  > Step 2 came out exactly as specified: a normal streamed answer plus follow-up
  > suggestions, and exactly one error-level line —
  > `[llm-fallback] reasonNode: anthropic failed, answering with openai
  > AuthenticationError: 401 … "API key is invalid."` — with the `suggestions`
  > call already skipping Anthropic on the breaker the reasoning loop had just
  > tripped.
  >
  > Step 5: `timeout --signal=KILL 8 curl` after 7969 bytes of streamed answer.
  > The log after it contains nothing at all — no `[llm-fallback]`, no
  > `agent error`, no warning. Which is the whole point.

- [x] **Step 4: Memory.** Turn `project_llm_provider_fallback.md` from an open
      chore into a record of what was built, and record **where it landed** —
      branch versus `main`, per the project checklist. "Pushed" is not landed.

- [x] **Step 5:** full suite + tsc + `/code-review`, report both axes, stop.
      `tsc` clean; 52 suites / 518 tests green (T6 touched no code, so no delta
      from T5). Both axes ran. Standards: one real violation — a bare-backtick
      `env.ts` reference where the repo's convention demands a markdown link —
      fixed; every factual claim in the new documentation was checked against
      source and holds. Spec: the framing of the recovery criterion was corrected
      above (a restart is a human action and proves nothing about unattended
      recovery), and the memory now says *uncommitted*, not merely *unmerged*.
      The two scope-creep notes — three Key Files rows and a second memory file —
      are deliberate: items 4 and 5 of the project's own After Each Task
      checklist ask for exactly them.

---

### Task 7: The system prompt is built for the provider that answers (R12)

**Why it is a task and not a footnote.** T3 forwarded one system message to both
providers on the strength of a live check against `gpt-4o`. On 2026-09-01 the
OpenAI model ids were moved to `gpt-5.5` / `gpt-5.4-mini` — an env-only change by
design — and the forced-failure run answered `code: 'agent_failed'`:

```
[llm-fallback] reasonNode: anthropic failed, answering with openai   AuthenticationError: 401
[llm-fallback] reasonNode: openai failed too — no provider left
    BadRequestError: 400 Unknown parameter: 'messages[0].content[0].cache_control'.
```

The ids were reverted in production the same hour. Until this task lands,
`OPENAI_REASONING_MODEL` cannot leave the gpt-4 family, which makes R9's "settable
from the environment" true only on paper.

**The change** — [reasonNode.ts](../../../backend-langgraph/src/graph/nodes/reasonNode.ts),
the only place in `src/` that writes `cache_control`. `buildSystemPrompt(state)` stays
one call per invocation; only the *message* becomes a function of the attempt's
provider, built inside the attempt where the provider is known:

```ts
const systemPrompt = buildSystemPrompt(state);
const systemMessageFor = (provider: Provider) =>
  provider === 'anthropic'
    ? new SystemMessage({ content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] })
    : new SystemMessage(systemPrompt);
```

An allowlist (`=== 'anthropic'`), not a denylist (`!== 'openai'`): a third provider
added later must default to the portable shape, not inherit another vendor's
extension.

The two `'fast'` call sites need nothing — neither writes a content block.

**Tests** — [reasonNode.test.ts](../../../backend-langgraph/tests/unit/graph/reasonNode.test.ts),
written first and confirmed failing:

```
- the primary still receives the cache_control block          (no regression on the paid-for feature)
- the standby receives the same prompt text with no cache_control anywhere in it
- the standby's system content carries no vendor keys at all  (deep, not just the first block)
- state.messages still reach the standby unchanged            (existing case, kept)
```

The third is what stops the fix from being "delete the key I happen to know
about". `'hands the standby the same messages the primary was given'` needs its
name and its assertion updated: the conversation is the same, the system message
deliberately is not.

**Verification.** `tsc`, the full suite, `/code-review`, and then the acceptance
criterion this was missing — the `force-provider-failure` recipe in SKILL.md with
`OPENAI_REASONING_MODEL=gpt-5.5` in the worktree `.env`. A green unit suite proves
nothing here: every fallback test mocks both provider SDKs, which is exactly why
the bug shipped.

- [x] **Done 2026-09-01.** `tsc` clean; 52 suites / 521 tests green (two new cases
      confirmed failing first). The live check ran the `force-provider-failure`
      recipe against a local backend on port 3010 with an invalid
      `ANTHROPIC_API_KEY` and `OPENAI_REASONING_MODEL=gpt-5.5` /
      `OPENAI_FAST_MODEL=gpt-5.4-mini`: the message answered — 36 streamed text
      chunks, a real `get_weather` call, three suggestions — with
      `[llm-fallback] reasonNode: anthropic failed, answering with openai
      AuthenticationError: 401`, the breaker holding on the loop's second pass
      (`anthropic is in cooldown`), and **zero** occurrences of `cache_control`
      or `agent_failed` in the log. Before this task the same setup produced
      `{"type":"error","code":"agent_failed"}`.

      **Negative control**, because a standby that silently fell back to `gpt-4o`
      would produce exactly the same green run: with the id changed to a
      nonexistent one, the request failed with
      `404 The model 'gpt-5.5-negative-control-nonexistent' does not exist`,
      naming the id. So `OPENAI_REASONING_MODEL` really was in play. The `.env`
      was `shred -u`'d afterwards and the two local dev rows deleted.

      `/code-review` — both axes ran. **Standards:** no hard violations; the one
      judgement call was real and is fixed — `'gives the standby a system message
      carrying no vendor keys at all'` scanned block keys over content that is a
      plain string, so it passed whatever the node did. It now pins the shape
      first, which is what makes the scan a guard rather than a tautology.
      **Spec:** no scope creep, no misimplementation, R3/R5/R9 unregressed, and
      the two `'fast'` call sites independently confirmed to build no content
      blocks. Its one finding was this checklist entry being absent — which is
      what this entry is.


---

## Acceptance

The spec's nine criteria, restated as the exit condition for this plan:

- [x] Anthropic down + OpenAI up → a normal streamed answer and one loud log (T3, T6·3)
- [x] A second message inside the window makes no Anthropic attempt (T2, T6·3)
- [x] Recovery after the cooldown needs no human (T2, T6·3)
- [x] An abort mid-answer diverts nothing and logs nothing (T2, T3, T6·3)
- [x] A post-first-token failure diverts nothing (T2, T3)
- [x] No standby key → the primary's error propagates unchanged (T2)
- [x] `LLM_FALLBACK_ENABLED=false` restores today's behaviour exactly (T2)
- [x] A standby is never constructed with the active provider's model id (T1)
- [x] `tsc` clean and the full suite green, at or above T0's baseline (every task)
- [x] A gpt-5.x standby answers a forced failure — the prompt carries no `cache_control` (T7)
