# Automatic LLM provider fallback

**Date:** 2026-08-31
**Status:** proposed — nothing implemented
**Origin:** [the 2026-08-31 credit-balance outage](#what-happened) — every chat
answered `agent_failed` for ~45 minutes while a working second provider sat
configured and unreachable.

---

## What happened

The Anthropic account ran out of credit. Every request came back as

> 400 `invalid_request_error` — "Your credit balance is too low to access the
> Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."

`/api/chat` sent `{ type: 'error', code: 'agent_failed' }` to every user for roughly
45 minutes (reqIds 69, 74, 79 in the Railway logs of service `travel-agent`).
Follow-up suggestions and memory extraction failed at the same time and in silence —
both swallow their errors, so nothing said they were down at all.

Nothing was wrong with the code. The balance was empty.

**The manual repair was `LLM_PROVIDER=openai` plus a container restart.** Setting the
variable alone did nothing: [createModel.ts](../../../backend-langgraph/src/llm/createModel.ts)
is called once per graph-singleton build, at
[reasonNode.ts:24](../../../backend-langgraph/src/graph/nodes/reasonNode.ts#L24), so
the provider is baked into a closure with the tools already bound. Only
`railway restart` — replacing the container — actually moved the traffic.

OpenAI was already fully configured throughout. `OPENAI_API_KEY` is set in
production and is the only copy of that key: both the web mic button and Telegram
voice notes reach Whisper through `/api/transcribe`. The standby existed the whole
time; nothing could reach it without a human and a restart.

---

## What this changes

When the primary provider errors, the same call is retried on the standby provider
automatically — no env edit, no restart. An outage becomes a few minutes of
lower-quality answers instead of a dead product.

### Requirements

**R1. Any error diverts.** Not a curated list of billing messages. If the primary
throws, the standby is tried. Two exceptions, R2 and R3.

**R2. An abort never diverts.** `/api/chat` aborts on client disconnect and on a 60 s
timeout. Falling back there would buy a second full LLM call for a user who has
already left, inside a budget that has already expired. Note that an abort surfaces as
*two* different error classes — see [Aborts are two classes](#aborts-are-two-classes-not-one).

**R3. A failure after the answer started streaming never diverts.** The reasoning model
runs with `streaming: true` and its tokens are on the SSE wire as they arrive; the
frontend **appends** text, it does not replace it. Restarting on the standby mid-answer
would paste a second, complete answer onto the tail of a truncated one. Such a request
fails exactly as it does today.

**R4. All three call sites are covered.** The reasoning loop
([reasonNode.ts:24](../../../backend-langgraph/src/graph/nodes/reasonNode.ts#L24),
`'full'` + streaming + bound tools),
[SuggestionService.ts:10](../../../backend-langgraph/src/services/SuggestionService.ts#L10)
and [MemoryService.ts:92](../../../backend-langgraph/src/services/MemoryService.ts#L92)
(both `'fast'`). A fallback wired only into the chat would leave follow-up suggestions
and memory extraction dead while the chat recovered — and because both of those already
degrade silently, that half of the outage would stay invisible.

**R5. The standby carries the same tools.** The reasoning model is useless without
them; a standby bound to nothing would answer the first question and then be unable to
search a flight.

**R6. It is loud.** A silent, permanent fallback means nobody tops up the balance and
the downgrade is eventually discovered by someone noticing worse answers. Every divert
logs at error level with the original error attached, naming both providers.

**R7. A sustained outage does not double every request's latency.** Retrying a dead
primary on every request adds its full connect-and-fail time — which can be tens of
seconds for a hung connection — in front of the standby's own latency, inside the same
60 s budget. After a failure the standby is used directly for a cooldown window, then
the primary is probed again.

**R8. Recovery needs no human.** When the cooldown elapses the primary is tried again.
Nobody has to notice, edit anything, or restart anything.

**R9. Each provider resolves its own model ids.** Today `MODEL_DEFAULTS` in
[env.ts](../../../backend-langgraph/src/config/env.ts) is indexed by the *active*
provider, so `env.REASONING_MODEL` holds `claude-sonnet-4-6` whenever
`LLM_PROVIDER=anthropic`. A standby reading it would ask OpenAI for a Claude model. The
ids also must be settable from the environment: the OpenAI ids are hardcoded in the
factory, were chosen in March 2026, and have never been revisited — a standby that
actually gets used deserves ids that can be updated without a deploy.

**R10. No standby means no fallback.** If the other provider's API key is unset, the
primary's error propagates unchanged. Attempting a call that cannot be authenticated
would only replace a clear Anthropic error with a confusing OpenAI one.

**R11. There is an off switch.** A kill switch that disables the whole mechanism, and a
cooldown of `0` that means "retry the primary every request".

### Explicitly not in scope

- Per-user or per-request provider choice. The switch is process-wide.
- Persisting the breaker across processes or instances. In-memory is enough for one
  container per service; a scaled-out deployment would simply have each instance
  probe on its own, which is a harmless duplication, not a wrong answer.
- Falling back for `/api/transcribe`. Whisper is OpenAI's; there is no second provider
  to fall back to.
- A third provider.

---

## Aborts are two classes, not one

A mid-stream abort throws `ModelAbortError` from `@langchain/core/errors`
(`name = "ModelAbortError"`), **not** a DOMException named `AbortError`. An abort
observed through `raceWithSignal` does surface as `AbortError`. Both are reachable
depending on where the abort is caught, so R2's classifier accepts both, plus a direct
`signal.aborted` check:

```ts
import { ModelAbortError } from '@langchain/core/errors';

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (ModelAbortError.isInstance(err)) return true;
  return err instanceof Error && err.name === 'AbortError';
}
```

This also exposes a pre-existing gap: [chat.ts](../../../backend-langgraph/src/routes/chat.ts)
tests aborts with `err.name === 'AbortError'` alone, so a client that disconnects
mid-answer can be logged as `agent error` and sent `code: 'agent_failed'` down a socket
that is already gone. Adjacent to this work rather than part of it, but it is the same
question asked three lines away, and the same classifier answers it.

---

## Why not `Runnable.withFallbacks()`

LangChain JS's `withFallbacks` takes `{ fallbacks }` and nothing else — no error
predicate, no `exceptions_to_handle` as in the Python implementation
(`node_modules/@langchain/core/dist/runnables/base.d.ts:48`). It catches **every**
thrown error, aborts included, which is exactly the one class R2 forbids diverting on.
It also has no notion of R3's "did this attempt already produce output". The wrapper
has to be ours.

---

## Knowing whether the attempt produced output (R3)

The reasoning node calls `model.invoke(...)` and the tokens reach the browser through
`graph.streamEvents`, so at catch time the node must know whether anything was emitted.

The mechanism is a `handleLLMNewToken` spy attached **per attempt**, merged into the
config LangGraph already hands the node:

- LangGraph passes a real config to node functions —
  `RunnableCallable._tracedInvoke` builds
  `patchConfig(config, { callbacks: runManager.getChild() })` and calls
  `this.func(input, childConfig)` (`@langchain/langgraph/dist/utils.js:20-26`).
  `reasonNode` currently drops that second argument.
- `mergeConfigs` **adds** a handler to that manager rather than replacing it —
  `baseCallbacks.copy()` then `addHandler(ensureHandler(cb), true)`
  (`@langchain/core/dist/runnables/config.js:41-50`), so the `streamEvents` handler
  survives. `ensureConfig` assigns `callbacks` wholesale, so passing
  `{ callbacks: [spy] }` straight into `.invoke()` would silently detach the model run
  from `streamEvents` and **text would stop reaching the browser**. `mergeConfigs` is
  public API, exported from `@langchain/core/runnables`.
- The callback does fire on the path this app takes: with a streaming-preferring
  handler attached — which `streamEvents` is — `BaseChatModel._generateUncached` runs
  `_streamResponseChunks`, and both providers call `runManager.handleLLMNewToken` from
  inside it (`@langchain/anthropic/dist/chat_models.js:903`,
  `@langchain/openai/dist/chat_models/completions.js:221,248`).

The spy lives in the per-invocation closure, so concurrent requests cannot see each
other's flag.

Two alternatives were considered and rejected. Re-implementing the node around
`.stream()` with manual `concat` aggregation duplicates ~70 lines of what `.invoke()`
already does internally on this exact path — chunk aggregation, `.tool_calls`
assembly, abort racing, `handleLLMEnd` lifecycle — for no gain and a standing risk of
drifting from it. Attaching the spy at model construction fails because the reasoning
model is a singleton shared by concurrent requests, and a closure flag cannot tell
their runs apart.

---

## Configuration

Six new environment variables, all optional, all with working defaults:

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_REASONING_MODEL` | `claude-sonnet-4-6` | Anthropic's `'full'` model, whichever role it plays |
| `ANTHROPIC_FAST_MODEL` | `claude-haiku-4-5-20251001` | Anthropic's `'fast'` model |
| `OPENAI_REASONING_MODEL` | `gpt-4o` | OpenAI's `'full'` model |
| `OPENAI_FAST_MODEL` | `gpt-4o-mini` | OpenAI's `'fast'` model |
| `LLM_FALLBACK_ENABLED` | `true` | Kill switch |
| `LLM_FALLBACK_COOLDOWN_MS` | `300000` | How long the standby is used before the primary is probed again; `0` retries the primary every request |

The existing `REASONING_MODEL` / `FAST_MODEL` keep their current meaning — they apply
to the **active** provider only — so nothing already deployed changes. The per-provider
keys win where both are set.

A note for whoever implements it: `z.coerce.boolean()` cannot express
`LLM_FALLBACK_ENABLED`, because `Boolean('false') === true` would make the kill switch
impossible to turn off.

---

## Acceptance criteria

1. With `ANTHROPIC_API_KEY` pointed at a spent or invalid key and a valid
   `OPENAI_API_KEY`, a chat message answers normally — streamed, with tool calls and
   follow-up suggestions — and the backend log carries one error-level `[llm-fallback]`
   line naming both providers.
2. A second message inside the cooldown window shows no second Anthropic attempt in the
   log and still answers.
3. After the key is restored and the cooldown elapses, the next message is answered by
   Anthropic with no fallback line.
4. Closing the tab mid-answer produces no fallback line and no second LLM call.
5. An error thrown after the first token has been emitted produces `agent_failed`, as
   today, and no second attempt.
6. With `OPENAI_API_KEY` unset, an Anthropic failure propagates unchanged and no
   standby call is made.
7. `LLM_FALLBACK_ENABLED=false` restores today's behaviour exactly.
8. A standby model is never constructed with the active provider's model id.
9. `npx tsc -p backend-langgraph/tsconfig.json --noEmit` clean, and the full
   backend-langgraph suite green.

---

## The trade-off being accepted

The earlier design note for this chore argued for diverting on the credit-balance
message specifically, because a blanket "any error → other provider" also hides real
bugs: a malformed tool schema or an over-long prompt is *also* a 400
`invalid_request_error`, and it would now be answered by OpenAI instead of surfacing.

Any-error was chosen deliberately (2026-08-31). The mitigations are R6 — every divert
is logged at error level with the original error attached — and R7's breaker, which
turns a systematic bug into a service visibly pinned to the standby rather than an
occasional blip nobody correlates.
