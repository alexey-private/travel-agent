# Security & quality audit — findings

**Date:** 2026-08-30
**Scope:** the i18n / RTL work (`d45d08f..898080e`, 15 commits, 116 files) and the
code it touches. Findings marked *pre-existing* were not introduced by that work;
they live in the surface it passes through and were found while reading it.
**Status of the tree at audit time:** `tsc` clean in both packages, 344 backend +
159 frontend tests green, `npm audit` clean, working tree clean.

Ordered by severity within each axis. `[ ]` = open, `[x]` = fixed.

---

## Security

### [x] S1 — The Telegram namespace turns an unguessable id into a guessable one

*Severity: critical. Pre-existing.*

A web visitor gets `crypto.randomUUID()` as their session id
([`frontend/src/lib/api.ts:210`](../../../frontend/src/lib/api.ts#L210)) — an
unguessable bearer capability. The bot instead derives `tg-<telegram user id>`
([`backend-telegram/src/session.ts:14`](../../../backend-telegram/src/session.ts#L14)),
and a Telegram user id is a public integer that anyone sharing a group with the
user can read.

There is no authentication between the bot and the backend, and no route checks
anything but the id in the URL:

```
GET  /api/conversations/tg-<id>          → another person's conversation list
GET  /api/conversations/tg-<id>/<convId> → their full message history
GET  /api/memory/tg-<id>                 → name, home city, diet, budget
POST /api/settings?userId=tg-<id>        → overwrite their preferences
```

Worse than it first looked: `GET /api/users/telegram` returns **every** Telegram
session id in the database, unauthenticated. The ids never had to be guessed —
one request enumerates the victims.

Two further routes accept a `tg-` id from a browser and could not be closed the
same way, since a redirect carries no header:
`/auth/google/start?userId=tg-<victim>` let anyone open a consent screen that
attaches *their* Google account to somebody else's session, and the callback
trusted an unsigned `state`, so a flow consented for one id could be redirected
onto another.

**Fixed** in `INTERNAL_API_SECRET`, shared by the backend and the bot. The ids
themselves are untouched — rewriting them would orphan every Telegram user's
conversations, memories and tokens. What changed is who may address them:

- a global `preHandler` hook refuses any request naming a `tg-` id, and
  `/api/users/telegram` outright, without the `x-internal-secret` header
  ([`security/internalAuth.ts`](../../../backend-langgraph/src/security/internalAuth.ts));
- the `/connect` link is signed over id, platform and a 10-minute expiry, which
  the route re-checks against a 15-minute ceiling
  ([`backendAuth.ts`](../../../backend-telegram/src/backendAuth.ts));
- OAuth `state` is signed with the Google client secret — present exactly where
  those routes are registered — so the callback cannot be retargeted.

Web ids are deliberately unchanged; they are already unguessable and a browser
has nowhere to keep a shared secret. A missing secret fails closed (503) and is
logged at boot.

**Deploy note:** both services must carry the same `INTERNAL_API_SECRET` before
either is redeployed, or the bot goes offline until they agree.

### [x] S2 — Hardcoded fallback encryption key, and no KDF

*Severity: high. Pre-existing.*

[`backend-langgraph/src/index.ts:72`](../../../backend-langgraph/src/index.ts#L72)
falls back to the literal `'default-dev-key-change-in-prod!!'` when
`ENCRYPTION_KEY` is unset. A production deploy that forgets the variable
encrypts every iCloud app-specific password under a key that is in the
repository, and nothing warns.

[`backend-langgraph/src/utils/crypto.ts:7-11`](../../../backend-langgraph/src/utils/crypto.ts#L7-L11)
then copies the raw UTF-8 passphrase into a 32-byte zero buffer: no
scrypt/HKDF, a short key is zero-padded, a long one is silently truncated. The
AES-256-GCM construction itself is correct (random 12-byte IV, auth tag stored).

**Fix direction:** fail fast when the variable is missing outside development;
derive the key with scrypt or HKDF rather than using the passphrase bytes.
Deriving changes the key, so existing ciphertext needs a versioned prefix or a
re-encryption pass.

**Fixed.** The fallback is gone from production: `ENCRYPTION_KEY` is now
required, and at least 32 characters, whenever `NODE_ENV=production`, checked in
[`config/env.ts`](../../../backend-langgraph/src/config/env.ts) so the process
exits at startup rather than at the moment someone connects an iCloud account.
Development still gets a fixed throwaway — one restart has to be able to read
what the previous one wrote — and its use is logged as a warning at boot. It is
the same literal as before, deliberately: rotating it would orphan every
credential already sitting in a developer's database and buys nothing once
production cannot reach it.

`NODE_ENV=test` is exempt along with development, which is narrower than "outside
development" as this finding first put it. It has to be: jest sets `NODE_ENV` to
`test`, the integration suite imports `config/env` through the database client,
and requiring the key there would make the test suite — and CI — depend on a
secret that protects nothing in it.

The AES key is derived with scrypt over a fixed application salt. A per-row salt
would be stronger, but it needs a column of its own and makes the derivation
impossible to cache; with one long-lived key the salt's remaining job is domain
separation. The derivation is memoised because scrypt is deliberately slow and
every calendar read would otherwise pay it.

Ciphertext written by the old scheme carries no marker, so the marker goes on the
new: everything written from now on is prefixed `v2:`, anything else is read with
the zero-padded key. That alone would leave a user who never reconnects sealed
under the weak key forever, so
[`ICloudTokenRepository.get`](../../../backend-langgraph/src/repositories/ICloudTokenRepository.ts)
re-encrypts a legacy row the first time it reads one — nothing else in the system
ever touches the password again. A failed rewrite is logged and does not fail the
calendar operation that asked for the credentials.

One property could not be recovered: Node's scrypt truncates a passphrase at the
first NUL byte, whether it is given a string or a Buffer, so a key containing one
still collides with its prefix. An environment variable cannot contain a NUL, so
this is unreachable — but it is why the test asserts truncation past 32
characters and not zero-padding.

**Deploy note:** the check is keyed on `NODE_ENV`, which Railway's variable list
did not show — but the runtime stage of
[`Dockerfile.backend-langgraph`](../../../Dockerfile.backend-langgraph) sets
`ENV NODE_ENV=production`, and the production logs confirm it: not one of the
`info` boot lines appears, and nothing is pretty-printed. The guard is armed. The
variable has since been set on the `travel-agent` service as well, with
`--skip-deploys` — it names the value the image already carries, so it changes
nothing at runtime and only makes the wiring visible in the Railway UI, the same
reason `PORT` is set there explicitly. `ENCRYPTION_KEY` is set on that service
and is 48 characters, so it clears the new minimum and nothing was ever
encrypted under the repository key.

### [x] S3 — Unescaped interpolation into Telegram `parse_mode: 'HTML'`

*Severity: high (one live user-visible failure). Pre-existing.*

`t()` substitutes variables without escaping and its output is sent as HTML.
Three call sites feed it text the app does not control:

- [`backend-telegram/src/notifier/calendar.cron.ts:57,65`](../../../backend-telegram/src/notifier/calendar.cron.ts#L57-L65) —
  calendar event and task titles from Google/iCloud. An event called
  `R&D <team> sync` makes Telegram reject the message with 400; the surrounding
  `catch` logs it, so **the person simply never receives their daily reminder**
  and has no way to find out why. An ampersand in a meeting title is ordinary.
- [`backend-telegram/src/commands/history.ts:89-94`](../../../backend-telegram/src/commands/history.ts#L89-L94) —
  the user's own messages and the model's replies inside `<i>…</i>`, with no
  escaping and no `.catch()`. One `<` anywhere in the history breaks `/history`
  outright.
- [`backend-telegram/src/chat.handler.ts:304`](../../../backend-telegram/src/chat.handler.ts#L304) —
  `🎤 <i>${transcribed}</i>`, Whisper output raw.

Lower-severity variants of the same shape: `chat.locationSet` interpolates a
reverse-geocoded city name, `history.loadFailed` and friends interpolate error
messages.

**Fixed** by escaping at the boundary rather than at each call site.
[`escapeHtml`](../../../backend-telegram/src/render.ts) is now exported and is
the single place that knows what Telegram treats as markup:

- [`t()`](../../../backend-telegram/src/i18n/t.ts) escapes the values it
  interpolates and leaves the template's own markup alone. That covers every
  key that takes a variable, including the ones nobody has written yet.
- the three sites that assemble HTML without going through `t()` — the calendar
  titles, the stored messages behind `/history`, the Whisper transcript — call
  `escapeHtml` on the interpolated half explicitly.

Because `t()` now escapes, the nine sends that interpolate a variable but were
posted as plain text would have shown `&amp;` to the user; they are sent as HTML
instead. That leaves one rule: **a key that takes a variable is sent as HTML**.
The exception is `commands.*`, which goes to `setMyCommands` as plain text and
takes no variables — which is why `'Calendar & Tasks'` may keep its bare
ampersand. A test walks every dictionary value outside `commands.*` and fails on
a bare `&` or a stray angle bracket, so the templates stay valid HTML on their
own.

Escaping inside `t()` has one consequence worth naming, found in review: a value
that is *already* a rendered message must not be handed back to `t()`, or it is
escaped twice and the user reads `&amp;amp;`.
[`sse-client.ts`](../../../backend-telegram/src/sse-client.ts) rendered two of
its error events itself and
[`chat.handler.ts`](../../../backend-telegram/src/chat.handler.ts) re-wrapped
them. The error event now has a single owner: every one leaving `streamChat` is
finished, translated HTML — including the ones the backend reports, which arrive
as raw English and are wrapped at that one place — and the caller sends it
unchanged.

### [x] S4 — Paid and CPU-bound endpoints have no rate limit

*Severity: medium. Pre-existing.*

Rate limiting is registered with `global: false`
([`backend-langgraph/src/index.ts:60`](../../../backend-langgraph/src/index.ts#L60)),
and only `/api/chat` opts in. That leaves
[`/api/transcribe`](../../../backend-langgraph/src/routes/transcribe.ts) — which
spends the OpenAI key on a body of up to 25 MB — and both
[`/api/export/pdf*`](../../../backend-langgraph/src/routes/export.ts)
routes, where PDF generation runs synchronously on the event loop against an
unbounded `text`.

**Fixed.** `/api/transcribe` now allows 20 calls a minute and each export route
10, alongside the 30 `/api/chat` already had. A 429 carries `code:
'rate_limited'` like every other error response here, because the export path
shows it to the user with no agent in between to translate it.

A limit on how *often* a route may be called says nothing about what one call
costs, and both endpoints named in this finding are expensive per call. Whisper
is billed by the minute of audio, so a 25 MB body — hours of speech at the
bitrate a browser records at — was worth twenty times a minute; `/api/transcribe`
now refuses a clip over 10 MB once decoded (`audio_too_large`, 413). The export
routes get the two caps below.

Surfacing that refusal turned out to be missing on the frontend:
[`useVoiceRecording`](../../../frontend/src/hooks/useVoiceRecording.ts) threw a
generic `Error` and only logged it, so a rejected recording vanished with no
explanation at all. It now translates by `code` the way the export path does.

Which caller a request counts against moved into
[`rateLimitKey`](../../../backend-langgraph/src/security/rateLimitKey.ts), asked
by all four routes. The rule it encodes is unchanged and still wrong in the way
S5 describes — it is now wrong in one place instead of four.

**Rate limiting alone did not bound the work**, which is what the measurements
turned up. pdfkit's line breaking is quadratic in the length of a single run
with no space in it, so the cost is in the shape of the text rather than its
size: 50 000 characters of prose take 72 ms, 2 000 characters with no space take
136 ms, 10 000 take 1.7 seconds, and 100 000 exhaust the heap — a crash, not a
slow request, well inside a body the 25 MB request limit accepts. Ten of those a
minute is still an outage. Both export routes therefore refuse a `text` over
50 000 characters (`text_too_long`, about twenty-five pages) or containing a run
of more than 500 characters without whitespace (`text_unbreakable_run`, longer
than any real URL), both 413. The worst case a caller can now buy is under half
a second.

### [x] S5 — The rate limit is keyed on a client-supplied value

*Severity: medium. Pre-existing.*

[`backend-langgraph/src/routes/chat.ts:74`](../../../backend-langgraph/src/routes/chat.ts#L74):
`keyGenerator: (req) => req.body.userId ?? req.ip`. Rotating `userId` per
request bypasses the limit entirely. The key should combine the id with the IP.

**Fixed**, though not by combining them — combining is the same bug with extra
steps. A key of `id:address` still hands a caller who invents a new id per
request a new bucket per request; it multiplies the budget rather than replacing
it. A `userId` that nothing attests to cannot appear in the key at all, so
[`rateLimitKey`](../../../backend-langgraph/src/security/rateLimitKey.ts) counts
a web caller by address alone. The cost is that everyone behind one NAT shares
one budget, which the ceilings (30 chats, 20 transcriptions, 10 exports a
minute) leave room for.

A `tg-` id is the one exception, and it is why this is not simply `req.ip`.
`registerInternalAuth` is a global `preHandler`, so it runs before the
route-level limiter and has already refused any `tg-` request that did not carry
the bridge secret — the id is attested by the time a key is computed. Counting
those by address would put every Telegram user into one bucket, since they all
arrive from the single bridge process. A test claims 25 `tg-` ids without the
secret and gets 25 × 403: the branch is unreachable to a web caller.

**The address had to be made real first.** Nothing trusted a proxy, so behind
Railway's edge `req.ip` was the edge — and keying on it would have counted the
entire user base as one caller, turning the limit into an outage at 30 requests
a minute. `TRUST_PROXY` now names which peers may speak for the caller through
`X-Forwarded-For`, defaulting — from
[`trustProxy.ts`](../../../backend-langgraph/src/security/trustProxy.ts) — to
the private and carrier-NAT ranges an edge proxy reaches a container from. Two details are easy to get wrong:

- **Trusting every peer would have reopened the hole.** With nothing left
  untrusted, Fastify's `req.ip` returns the *first* entry of the chain — the
  part the caller wrote. Trusting by peer address instead believes only the
  entry the trusted proxy appended, so prepending hops buys nothing; a test
  rotates the spoofed prefix and lands in the same bucket every time. The
  setting is a list of addresses and ranges, and the parser rejects both `true`
  and a literal `0.0.0.0/0`, so a catch-all has to be written deliberately and
  cannot be reached by a typo — a value Fastify cannot parse stops the process
  at startup.
- **A hop count is not available.** Fastify 5 fails a numeric `trustProxy`
  closed — `getTrustProxyFn` returns `() => false` for a number — so trust has
  to be expressed as addresses or ranges.

An untrusted proxy is otherwise silent, so the backend logs a warning naming the
peer the first time it sees one, and `DEPLOYMENT.md` says what to do with it.

### [x] S6 — CORS reflects any origin, with credentials allowed

*Severity: low-medium. Pre-existing.*

[`backend-langgraph/src/index.ts:55`](../../../backend-langgraph/src/index.ts#L55)
uses `origin: env.ALLOWED_ORIGIN ?? true`, and
[`chat.ts:123`](../../../backend-langgraph/src/routes/chat.ts#L123) writes
`ALLOWED_ORIGIN ?? request.headers.origin ?? '*'` next to
`Access-Control-Allow-Credentials: true`. No cookies are used, so exploitability
is limited — but a deploy missing `ALLOWED_ORIGIN` lets any page read the SSE
stream given a user id.

**Fixed.** The origin decision is now an allowlist, made once, in
[`security/cors.ts`](../../../backend-langgraph/src/security/cors.ts).

Two things were wrong, and only one of them was the reflection. The streaming
route decided the question a *second* time, by hand, because `reply.hijack()`
takes the socket and nothing then sends the headers the CORS plugin set on the
reply. Its answer differed from the plugin's: where the plugin would refuse an
unknown origin, the route echoed it. `hijackedCorsHeaders` copies the plugin's
own `Access-Control-Allow-Origin`, `Access-Control-Expose-Headers` and `Vary`
into the raw `writeHead` instead, so there is one decision and no way for the
two to disagree. `Vary: Origin` matters here on its own — without it a cache
can hand one origin the answer computed for another.

`Access-Control-Allow-Credentials: true` is gone rather than corrected. Nothing
in this app authenticates by cookie (the frontend never sets
`credentials: 'include'`), and the header is exactly what would turn a future
mistake in the allowlist into a way to read a signed-in user's stream.

`ALLOWED_ORIGIN` became comma-separated and **required in production**, checked
in the same `superRefine` that already guards `ENCRYPTION_KEY`. The finding
described the danger as "a deploy missing `ALLOWED_ORIGIN`", and there is no
safe reading of that omission: the alternatives are refusing every browser and
trusting all of them. Failing at boot says so out loud. The live Railway
deployment already sets it, so the requirement costs nothing there. Development
keeps working with nothing configured — `localhost` and `127.0.0.1` on any port
are allowed, since the frontend's port already makes it cross-origin — and that
default is unreachable in production, where the variable must be set.

Non-browser callers are unaffected: an origin outside the list is not rejected,
it merely receives no `Access-Control-Allow-Origin`. The Telegram bridge sends
no `Origin` at all.

Covered by [`tests/unit/security/cors.test.ts`](../../../backend-langgraph/tests/unit/security/cors.test.ts)
— which mounts both an ordinary route and a hijacking one, so the two paths are
asserted to agree — by three tests against the real `/api/chat` in
[`chat.p0.test.ts`](../../../backend-langgraph/tests/unit/routes/chat.p0.test.ts),
and by the `ALLOWED_ORIGIN` block of
[`env.test.ts`](../../../backend-langgraph/tests/unit/config/env.test.ts).
Eight mutations, including restoring the original reflection, were all caught.

### [ ] S7 — Small leaks

*Severity: low. Pre-existing.*

- [`backend-langgraph/src/routes/settings.ts:150`](../../../backend-langgraph/src/routes/settings.ts#L150)
  returns the raw CalDAV `err.message` to the client.
- The language cookie is written without `Secure`
  ([`frontend/src/i18n/LanguageProvider.tsx:30`](../../../frontend/src/i18n/LanguageProvider.tsx#L30)).

The frontend is clean for XSS: `react-markdown` runs without `rehype-raw` and
there is no `dangerouslySetInnerHTML` anywhere.

---

## Correctness / optimisation

### [ ] O1 — The bot's voice path never sends the language hint

*Severity: medium — a shipped feature that does not work on one surface.*

[`backend-telegram/src/chat.handler.ts:283-288`](../../../backend-telegram/src/chat.handler.ts#L283-L288)
calls Whisper directly, with the bot's own OpenAI key, and passes no
`language`. The bug the hint exists to fix — short Hebrew clips coming back
transliterated into Latin, see
[`transcribe.ts:29-33`](../../../backend-langgraph/src/routes/transcribe.ts#L29-L33) —
is therefore still live for Telegram voice messages. Routing the bot through
`/api/transcribe` fixes the hint and removes a second copy of a paid key.

### [ ] O2 — `Intl` formatters constructed per call

Five sites: [`dateUtils.ts:21,29,33,36`](../../../frontend/src/lib/dateUtils.ts#L21-L36),
[`fileUtils.ts:18,25,32`](../../../frontend/src/lib/fileUtils.ts#L18-L32),
[`translate.ts:27`](../../../frontend/src/i18n/translate.ts#L27),
[`backend-telegram/src/i18n/t.ts:27`](../../../backend-telegram/src/i18n/t.ts#L27),
[`notifications.ts:18`](../../../backend-langgraph/src/i18n/notifications.ts#L18).
Constructing an `Intl.*Format` is the classic expensive call; a 50-item
conversation list builds 50 of them per render. One `Map<locale, formatter>`
covers all five.

### [ ] O3 — PDF fonts re-registered on every request

[`export.ts:50-54`](../../../backend-langgraph/src/routes/export.ts#L50-L54)
registers five DejaVu faces (~700 KB each) per export. Read the buffers once at
module level.

### [ ] O4 — The push cron walks users strictly sequentially

[`web-push.cron.ts:105`](../../../backend-langgraph/src/notifier/web-push.cron.ts#L105)
awaits two network calls per person inside a `for` loop; the run grows linearly
with the subscriber count. Bounded concurrency (5–10) fixes it. In the same
file, [`tomorrowDate()`](../../../backend-langgraph/src/notifier/web-push.cron.ts#L18-L22)
mixes a local-time `setDate` with a UTC `toISOString`, so "tomorrow" can shift
by a day on a server that is not in UTC.

### [ ] O5 — `detectTextDir` recomputes on every stream chunk

[`MessageBubble.tsx:108`](../../../frontend/src/components/chat/MessageBubble.tsx#L108).
Measured: 22 ms across a full 400-chunk stream of a 5 KB reply — real but not
the bottleneck, since `ReactMarkdown` re-parses the whole document on each chunk
and costs far more. The interesting part is the side effect: the direction
**flips mid-stream** (`# 🇯🇵` alone resolves `ltr`, then Hebrew arrives and it
becomes `rtl`).

### [ ] O6 — All three dictionaries ship to every client

[`dictionaries.ts:2-4`](../../../frontend/src/i18n/dictionaries.ts#L2-L4)
statically imports `en` + `he` + `ru` (48 KB) plus
[`starterSuggestions.ts`](../../../frontend/src/data/starterSuggestions.ts)
(13 KB); a visitor uses one third of it. A dynamic import per locale collides
with the synchronous access `LanguageProvider` needs during SSR, so this is a
trade-off rather than an obvious win.

---

## Refactoring

### [ ] R1 — i18n is triplicated across the three packages

`Locale`, `LOCALES`, `DEFAULT_LOCALE`, `isLocale`, `LOCALE_LABELS`,
`PluralForms`, `TVars` and the `translate`/`t` function exist in three identical
copies: [`frontend/src/i18n/config.ts`](../../../frontend/src/i18n/config.ts),
[`backend-telegram/src/i18n/config.ts`](../../../backend-telegram/src/i18n/config.ts),
[`backend-langgraph/src/i18n/locale.ts`](../../../backend-langgraph/src/i18n/locale.ts) —
each carrying a comment that adding a locale means editing all four places. A
shared workspace package would collapse it. Caveat: the dependency must be
declared in every consuming `package.json` (otherwise the hoisting trap
recurs) and all three Dockerfiles must copy it.

### [ ] R2 — The "no language chosen" state cannot be written

Migration 016 deliberately made the column nullable, but
[`UserPreferencesRepository.ts:72`](../../../backend-langgraph/src/repositories/UserPreferencesRepository.ts#L72)
uses `COALESCE($7, existing)`, so `language: null` is indistinguishable from
"leave it alone". Nothing needs to reset a language today, which is why this is
latent rather than broken — but the state the migration exists to express is
reachable only by never having written a row.

### [ ] R3 — `stripEmoji` deletes Arabic presentation forms

[`export.ts:413`](../../../backend-langgraph/src/routes/export.ts#L413) strips
`︀-﻿`, which contains FE70–FEFC — exactly the range
[`bidi.ts:16`](../../../backend-langgraph/src/utils/bidi.ts#L16) includes in
`RTL_CHARS` while stating that Arabic is handled. Hebrew is unaffected
(FB1D–FB4F), so there is no live damage; two modules simply contradict each
other.

### [ ] R4 — Three different ways of writing the same script ranges

[`detectTextDir.ts:26`](../../../frontend/src/i18n/detectTextDir.ts#L26) uses
`\uXXXX` escapes, while
[`detectReplyLocale.ts:17-19`](../../../backend-langgraph/src/i18n/detectReplyLocale.ts#L17-L19)
and [`bidi.ts:16`](../../../backend-langgraph/src/utils/bidi.ts#L16) embed
literal glyphs. Literal ranges are unreadable in a diff, fragile under
re-encoding, and already resisted one edit.

### [x] R5 — `t` is shadowed inside a loop

[`calendar.cron.ts:64`](../../../backend-telegram/src/notifier/calendar.cron.ts#L64):
`for (const t of tasks)` shadows the imported translate function. It works only
because nothing inside the loop translates anything.

**Fixed** alongside S3 — the loop body had to be edited to escape the title
anyway, and the variable is now `task`.

### [ ] R6 — Memory extraction uses the setting, not the message's language

[`chat.ts:298`](../../../backend-langgraph/src/routes/chat.ts#L298) passes the
stored language to `extractAndSaveMemories`, whose prompt then asserts "The user
writes in ${name}" — false in exactly the case `detectReplyLocale` exists for: a
Hebrew-configured user writing in English. Follow-up suggestions already handle
this ([`chat.ts:268`](../../../backend-langgraph/src/routes/chat.ts#L268));
memory does not.

### [ ] R7 — Small things

- [`export.ts`](../../../backend-langgraph/src/routes/export.ts) is 430 lines of
  routing plus a markdown renderer in one file; `renderMarkdown` at
  [line 248](../../../backend-langgraph/src/routes/export.ts#L248) computes
  `clean(line)` and discards it, passing the raw line onward.
- [`frontend/next-env.d.ts`](../../../frontend/next-env.d.ts) flips between
  `.next/dev/types` and `.next/types` depending on whether `dev` or `build` ran
  last, producing a permanent spurious diff.

---

## Environment note (not a repository defect)

At audit time the main checkout had not been reinstalled after `bidi-js` was
added, so three suites failed to run with `Cannot find module 'bidi-js'` and
**39 tests silently did not execute** — including the RTL feature's own
[`bidi.test.ts`](../../../backend-langgraph/tests/unit/utils/bidi.test.ts) and
[`exportRtl.test.ts`](../../../backend-langgraph/tests/unit/routes/exportRtl.test.ts).
`npm install` restored them. CI runs `npm ci` and was never affected. Worth
remembering: a new dependency in a workspace means every existing checkout is
one install behind, and Jest reports that as a failed *suite*, not a failed
test — easy to skim past.
