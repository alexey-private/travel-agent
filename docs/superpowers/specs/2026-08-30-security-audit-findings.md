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

### [x] S7 — Small leaks

*Severity: low. Pre-existing.*

- [`backend-langgraph/src/routes/settings.ts:150`](../../../backend-langgraph/src/routes/settings.ts#L150)
  returns the raw CalDAV `err.message` to the client.
- The language cookie is written without `Secure`
  ([`frontend/src/i18n/LanguageProvider.tsx:30`](../../../frontend/src/i18n/LanguageProvider.tsx#L30)).

The frontend is clean for XSS: `react-markdown` runs without `rehype-raw` and
there is no `dangerouslySetInnerHTML` anywhere.

**Fixed.**

*The CalDAV message.* iCloud writes its failures for whoever runs the server:
the text can name the account, the collection URL or the upstream response
verbatim. It now goes to `req.log.error` and the caller gets
`Could not reach Apple iCloud` beside the unchanged `apple_request_failed`
code. Nothing is lost — the detail moves to where it is useful, and it was
never used at the other end anyway: `getAppleReminderLists` returns `[]` on a
non-OK response without reading the body. `/auth/apple/connect`, the sibling
route, already answered with fixed text; this was the one that did not.

The same shape at [`chat.ts:290`](../../../backend-langgraph/src/routes/chat.ts#L290)
is left alone here, but not because it is fine — it is a different failure with
a different audience, and changing it is a product decision rather than a
tightening. It is written up separately as S8 below.

*The cookie.* `Secure` is now set, but only when the page is served over
HTTPS. A browser silently discards a Secure cookie written from a plaintext
page, so an unconditional flag would leave the language resetting on every
reload in development — and over http there is no confidentiality to protect
in the first place. `SameSite=Lax` is unchanged; `HttpOnly` is not available
here, since the same JavaScript that writes the cookie reads it back to decide
whether the server already had one.

Covered by the `a CalDAV failure` suite in
[`settings.test.ts`](../../../backend-langgraph/tests/unit/routes/settings.test.ts)
— caller told nothing, log told everything, happy path intact — and by the two
halves of the cookie rule, which need two jsdom environments: HTTPS in
[`languageCookieSecure.test.tsx`](../../../frontend/src/__tests__/i18n/languageCookieSecure.test.tsx),
plain HTTP in
[`LanguageProvider.test.tsx`](../../../frontend/src/__tests__/i18n/LanguageProvider.test.tsx).
`document.cookie` reads back name and value only, so both assert on the write
itself via `captureCookieWrites`. Eight mutations were applied by hand — there
is no mutation-testing tool in this repo — each reverting one line of the fix or
one guarantee around it, including both original behaviours; every one of them
turned a suite red.

---

### [ ] S8 — `/api/chat` sends its raw failure to Telegram and nothing to the web

*Severity: low. Pre-existing. Found while fixing S7.*

[`chat.ts:290`](../../../backend-langgraph/src/routes/chat.ts#L290) logs the
error and then puts `err.message` on the wire as an SSE `error` event. Two
things follow, and neither looks deliberate:

- **Telegram shows it verbatim.** `chat.handler.ts` renders the event through
  `chat.failed` — "Sorry, something went wrong: {message}" — so whatever the
  model provider, the database driver or a tool threw is read by the user.
- **The web shows nothing at all.** `AgentEvent` in
  [`frontend/src/types/agent.ts`](../../../frontend/src/types/agent.ts) has no
  `error` variant and the `switch` in `useStreamChat` has no case for it, so the
  browser parses the event and discards it. The assistant bubble simply stops,
  empty, when `done` follows.

Fixing the leak and fixing the silence pull in opposite directions — one wants
less text on the wire, the other wants the text to arrive somewhere — so this
needs a decision about what a failed turn should say, not just an edit.

---

## Correctness / optimisation

### [x] O1 — The bot's voice path never sends the language hint

*Severity: medium — a shipped feature that did not work on one surface.*

**Fixed.** The bot no longer talks to Whisper. A voice note now goes to
[`/api/transcribe`](../../../backend-langgraph/src/routes/transcribe.ts) through
[`backend-telegram/src/transcribe.ts`](../../../backend-telegram/src/transcribe.ts),
which is where the `language` hint has been sent since the web mic button was
built. The hint exists because Whisper mis-detects short Hebrew clips and returns
them transliterated into Latin; a Telegram voice note got exactly that, because
the bot's own call had no field for it. The second copy of the OpenAI key is gone
with it — `OPENAI_API_KEY` is no longer a `backend-telegram` variable at all.

Three things had to come with the move, none of them optional:

- **The request names the user.** `userId: tg-<id>` is in the body because the
  backend's limiter reads it there. Without it every Telegram voice note is keyed
  by address, and they all arrive from the one bridge process — the whole bot
  would share one 20-a-minute bucket. Naming a `tg-` id is also what makes the
  request Telegram-scoped, so it carries `internalHeaders()` like every other
  call this bridge makes; one that forgot would be a 403, not a subtle bug.
- **The refusal is translated, not forwarded.** The backend answers in English
  with a snake_case `code`, and the bot has its own three dictionaries, so it maps
  the code (`audio_too_large`, `rate_limited`, `transcribe_not_configured`) to a
  key of its own and logs the rest. Two of those the bot could not receive at all
  before — it was not behind a rate limit or a size cap — so
  `chat.voiceTooLong` and `chat.voiceTooMany` are new in all three locales.
- **`chat.voiceTranscribeFailed` lost its `{message}`.** It used to interpolate
  whatever was thrown, which on the old path was Whisper's raw response body.
  What replaces it is a fixed sentence, with the detail in the log — the same
  rule as S7. `chat.voiceDownloadFailed` still interpolates: that is the Telegram
  download, untouched by this change.

Twelve tests cover the request the bot makes and the answer it renders. Ten
mutations were applied by hand — dropping the hint, dropping the id, dropping the
secret, restoring the OpenAI URL, emptying the code map, and so on — and every
one of them turned the suite red.

### [x] O2 — `Intl` formatters constructed per call

**Fixed.** The finding named five files; there were six. The sixth is
[`starterSuggestions.ts`](../../../frontend/src/data/starterSuggestions.ts),
where `monthName` built a `DateTimeFormat` per suggestion that names a month —
a dozen per set, three sets, all at import.

Measured on this project's machine (Node 22, 20 000 iterations): constructing a
`DateTimeFormat` costs **25.8 µs** and formatting with one **0.76 µs**; a
`NumberFormat` 4.9 µs against 0.35 µs; `PluralRules` 4.2 µs against 0.36 µs. So
a 50-row conversation list was spending ~1.3 ms per render building formatters
to do ~38 µs of formatting. Nothing about the output changes — a cache is
invisible to an assertion on the rendered string, which is why the tests count
constructions instead.

Two shapes, because the packages are not the same problem:

- **Frontend — a lazy cache.** [`perLocale`](../../../frontend/src/i18n/perLocale.ts)
  memoises one value per locale and builds on first use. Nine formatters across
  four modules go through it (`dateUtils` ×4, `fileUtils` ×3, `translate`,
  `starterSuggestions`), and building them at import would move the cost onto a
  page that renders in one language and pays for three.
- **Both backends — a `Record<Locale, …>` built at import.**
  [`t.ts`](../../../backend-telegram/src/i18n/t.ts) needs one `PluralRules` per
  locale and [`notifications.ts`](../../../backend-langgraph/src/i18n/notifications.ts)
  one `DateTimeFormat` per locale plus the single Russian `PluralRules`. One
  formatter per module does not justify a memo helper, a long-lived process has
  no cold start to protect, and the dictionaries and phrase tables beside them
  are already written as exhaustive records — including the
  `?? DEFAULT_LOCALE` fallback, which the lookup one line above already had.
  Copying a ten-line helper into three packages that cannot import each other
  would have been the more expensive answer.

The record in `t.ts` is a small behaviour change at the edge: a locale from
outside the `Locale` type used to get that language's real plural rules and now
gets the default's, matching the dictionary lookup directly above it, which has
always answered such a caller in English. A test pins it.

Eleven new tests — three for `perLocale`, one construction count for each of
the six call sites, one more for the Russian plural rules in the notifications,
and one for the fallback. Eleven mutations were applied by hand (each cache
reverted to a per-call construction, plus three that break `perLocale` itself
and one that drops the fallback); every one turned its suite red.

### [x] O3 — PDF fonts re-registered on every request

**Fixed** — but not the way the finding prescribed, because that way gains
nothing. Measured on this project's machine (Node 22, pdfkit 0.20.1, one export
of a short markdown document):

| registered as | ms/export |
|---|---|
| a path (before) | **28.5** |
| a `Buffer` read once at module level | **27.3** |
| a fontkit face parsed once at module level | **4.2** |

Reading the files is not the expensive half: `readFileSync` on all five costs
0.6 ms and `fontkit.openSync` 0.3 ms, because fontkit decodes lazily. What costs
24 ms is everything it then memoises *on the face* — decoded tables, the cmap
processor, the layout engine, the glyph cache — built on first use and thrown
away with the document that provoked it. So the fix is to share the parsed face,
not the bytes.

`PDFFontFactory.open` takes any `src` carrying a `layout` method, so a fontkit
face can be handed to `registerFont` directly; pdfkit's published types stop at
`string | Buffer | Uint8Array | ArrayBuffer`, so the one cast lives in
`registerFonts` with the reason above it. `fontkit` was a transitive dependency
of pdfkit and is now declared in `backend-langgraph/package.json`, where an
import of it belongs.

Sharing one face across documents is safe, and the tests say why rather than
assuming it: pdfkit gives every document its own subset and its own layout
cache, `font.layout()` returns a fresh run each call rather than a shared one to
be scaled twice, and the caches fontkit keeps on the face are bounded by the
font. A `.ttf` holds one face; `face()` refuses a collection at boot rather than
letting pdfkit throw once per export.

Five tests. The load-bearing one watches what `registerFont` actually receives:
five sources, each an object carrying a `layout` method rather than a path or a
buffer, and — by identity, not equality — the same five objects on the next
export. The other four: the faces are opened once at import and not again across
three exports (fontkit's `openSync` counted under a mock); a second export of the
same text is byte-identical to the first; three exports in flight at once each
match a reference export; and a collection is refused.

Two of those tests compare whole payloads, which needs the two bytes that
identify a document rather than describe it stripped first. pdfkit writes the
creation date as an *indirect* object, so the `(D:…)` literal stands alone rather
than after a `/CreationDate` key — a first version of the helper matched the key,
matched nothing, and left a test that failed whenever two exports fell either
side of a second. The helper now matches the literal.

Four mutations were applied by hand: registering the paths again, registering
buffers read once at module level (what the finding asked for), moving the parse
into the request, and dropping the collection guard. All four turn the suite red
— but only after the `registerFont` test above was written. Counting `openSync`,
which was the first attempt, cannot tell the fix from the original code: `face()`
runs at import either way, and pdfkit opens a registered path through `fs`, not
through the mocked fontkit.

### [x] O4 — The push cron walks users strictly sequentially

[`web-push.cron.ts:105`](../../../backend-langgraph/src/notifier/web-push.cron.ts#L105)
awaits two network calls per person inside a `for` loop; the run grows linearly
with the subscriber count. Bounded concurrency (5–10) fixes it. In the same
file, [`tomorrowDate()`](../../../backend-langgraph/src/notifier/web-push.cron.ts#L18-L22)
mixes a local-time `setDate` with a UTC `toISOString`, so "tomorrow" can shift
by a day on a server that is not in UTC.

**Fixed.** The per-user body moved into a `notify` function and the loop became
`forEachWithConcurrency(byUser, 5, notify)` — a new
[`src/utils/concurrency.ts`](../../../backend-langgraph/src/utils/concurrency.ts)
holding a fixed pool of workers over a shared cursor. Five, at the low end of
the range, because the number is a ceiling on concurrent requests to Google
rather than on local work. The sends *within* one person stay sequential: those
are their own two or three devices, and the round trip is to a push service, not
to the provider that made the run slow.

The helper does not stop at the first rejection. Every item is attempted and the
failures are re-thrown together as an `AggregateError`, which is what preserved
the old `continue` behaviour — one unreachable calendar costs one person their
notification, not everyone after them their turn. It made one thing strictly
better: a failed cleanup of a stale subscription (the one call the per-user
handler never caught) used to throw out of the sequential loop and abandon
everybody who had not been reached yet.

The second half was the more serious bug. `toISOString()` renders in UTC, so the
day was added on one calendar and read off another:

| Server | 09:00 local | old `tomorrowDate()` | correct |
|--------|-------------|----------------------|---------|
| Pacific/Auckland | 2026-08-30 | `2026-08-30` — *today* | `2026-08-31` |
| Australia/Adelaide | 2026-08-30 | `2026-08-30` — *today* | `2026-08-31` |
| Asia/Jerusalem | 2026-08-30 | `2026-08-31` | `2026-08-31` |
| America/Los_Angeles (22:00 run) | 2026-08-30 | `2026-09-01` | `2026-08-31` |

At the default run hour the boundary is nine hours ahead of UTC, not UTC+10:
anything past it renders back into today, which puts Adelaide's UTC+9:30 on the
broken side along with the rest of central and eastern Australia and New
Zealand. Those users were notified about the events they were already having,
and tomorrow's were never mentioned. `tomorrowDate` now formats the
local date components and takes an optional `now`, and is exported for the same
reason `buildPayload` is.

Seventeen new tests. Seven cover the pool directly: the limit is a ceiling and a
floor (with ten gated items and a limit of three, exactly three start, and a
fourth starts the moment one finishes), a slow item delays only its own worker,
every item is attempted despite rejections, and a limit below one is refused
rather than silently hanging. Three cover the cron: twelve subscribers with
nobody's calendar answering yet start exactly five — one walk of the list would
start one and `Promise.all` would start twelve — one unreachable calendar costs
only its own owner, and a failing cleanup no longer ends the run.

The timezone matrix is the remaining seven, and it runs in child processes. TZ
cannot be changed from inside a jest test: jest hands each file a copied
`process`, so assigning `process.env.TZ` never reaches the setter that tells V8
to forget the zone it cached — verified, not assumed. Seven cases spawn
`tests/helpers/printTomorrow.ts` under a real `TZ`, covering both directions of
the error, the half-hour offset that makes UTC+10 the wrong threshold, and the
month boundary.

Seven mutations applied by hand, all caught: rendering in UTC again, walking one
at a time, starting everyone at once, a limit of ten instead of five, dropping
the guard around the run, letting one rejection strand the queue, and accepting
a limit of zero.

### [x] O5 — `detectTextDir` recomputes on every stream chunk

[`MessageBubble.tsx:108`](../../../frontend/src/components/chat/MessageBubble.tsx#L108).
Measured: 22 ms across a full 400-chunk stream of a 5 KB reply — real but not
the bottleneck, since `ReactMarkdown` re-parses the whole document on each chunk
and costs far more. The interesting part is the side effect: the direction
**flips mid-stream** (`# 🇯🇵` alone resolves `ltr`, then Hebrew arrives and it
becomes `rtl`).

**Fixed.** Both halves, in a new
[`frontend/src/i18n/useTextDirection.ts`](../../../frontend/src/i18n/useTextDirection.ts).

The cost first, because measuring it changed what was worth doing. Two regex
passes over a string that grows with every chunk is quadratic, and 5 KB is where
it still looks harmless. Reproduced at one chunk per ~12 characters:

| Reply | chunks | before | after |
|-------|--------|--------|-------|
| 5 KB | 417 | 16 ms | 0.5 ms |
| 20 KB | 1 667 | 267 ms | 40 ms |
| 50 KB | 4 167 | 1 756 ms | 264 ms |

The hook counts only the tail each chunk adds, which it can because neither
pattern matches across a join. What it does *not* do is assume the text only
grows: `startsWith` checks that the new text extends what was counted, and
anything else — a different message in a reused instance, a render React began
with older state and discarded — is recounted from the start. That check is why
the "after" column is still quadratic. It compares bytes where the old code
matched two regexes — six to forty times cheaper on the same string, the gap
widening as the string gets shorter — and on a realistically sized reply the
whole remaining term is half a millisecond. Buying it out would mean trusting
the caller instead of checking, which is not worth 0.5 ms.

The flip is the half a reader actually notices, and it is not a rounding error:
on the reply from the original bug report the bubble is left-aligned for the
whole of `# 🇯🇵 ` and jumps right the moment the first Hebrew letter lands behind
it — five visible characters in, which at streaming speed is long enough to see. The cause is that `detectTextDir` has to return
some direction even when the text holds no letter of any script, and `ltr` was
the fallback. `dirFromCounts` now returns `null` in that state and the hook turns
it into `undefined`, so no `dir` attribute is written and the bubble keeps the
document direction — which `<html dir>` already carries from the interface
locale. That is a better provisional answer than a fixed `ltr`: a Hebrew
interface is where Hebrew replies turn up. It is still provisional, and the text
overrules it the moment the text says anything.

Saying nothing is confined to the gap it was meant for. The hook takes
`streaming`, and a message that has *finished* arriving with no letters in it —
a price, a room number, an emoji — is not waiting for evidence, it is the whole
message; it stays `ltr`, which is what `detectTextDir` has always said about it.
Without that distinction such a bubble would have no direction of its own for
good, and switching the interface language would re-align something the reader
had already read. Review caught this: the finding is about a provisional prefix,
and nothing about a finished message was asked to change.

This does not abolish flipping, and cannot. A reply opening `JST — Japan
Standard Time` has real Latin evidence from its third character and is read that
way; the Hebrew that overturns it arrives forty characters later. Nothing short
of waiting for the whole message avoids that, and waiting means showing nothing.
What the fix removes is the flip that came from *guessing with no evidence*,
which is the common one — the agent opens replies with an emoji heading. The
trade is that the remaining guess is now the interface locale, so the reply that
reads the opposite way from the window around it flips once where it did not
before.

`detectTextDir` keeps its old signature and its eight tests unchanged; it is now
`dirFromCounts(countLetters(text)) ?? "ltr"`, which agrees with the old body on
every input — the old one skipped the Latin count when there was no Hebrew, and
the answer in that case is `ltr` either way. After this change nothing outside the
test suite calls it, where it goes on serving as the statement of the rule and as
the yardstick the hook's incremental counting is checked against.

Sixteen new tests. Thirteen on the hook: while a message is arriving it says
nothing for an empty one, for an emoji heading, or for a line of digits and
symbols, and answers on the first letter; once it has finished, a letterless
message is `ltr` and one with letters still reads as itself; it never reverses a
direction it has already shown across the whole bug-report reply, character by
character; it agrees with a full scan at *every* prefix, which is what proves the
incremental counting has not drifted; it recounts when the text is replaced
rather than extended, and when the text goes backwards; and it survives a
StrictMode double render. Three on the bubble: no `dir` attribute while the reply
is still an emoji, `rtl` once Hebrew arrives, and `ltr` on a finished message
with nothing but a price in it. Those three assert on the bubble element itself
rather than `closest("[dir]")`, which would have found the `dir` jsdom puts on
`<html>` — or the one an inline `code` span carries.

Ten mutations applied by hand, all caught: dropping the `startsWith` guard,
weakening it to a length comparison, adding the whole text to the running total
instead of the tail, restoring the `ltr` guess, calling a Hebrew-only message
undecided, dropping the 3:1 margin, committing the bubble to `ltr` while it is
undecided, extending the silence to finished messages, dropping the streaming
distinction altogether, and telling the hook every message is still streaming.
The third of those was expected to survive — the margin compares
the counts against each other, so uniform double counting is invisible — and did
not, because the composition of a reply changes as it streams and the inflated
totals no longer sum to the same ratio.

### [x] O6 — All three dictionaries ship to every client

[`dictionaries.ts:2-4`](../../../frontend/src/i18n/dictionaries.ts#L2-L4)
statically imports `en` + `he` + `ru` (48 KB) plus
[`starterSuggestions.ts`](../../../frontend/src/data/starterSuggestions.ts)
(13 KB); a visitor uses one third of it. A dynamic import per locale collides
with the synchronous access `LanguageProvider` needs during SSR, so this is a
trade-off rather than an obvious win.

**Measured, and deliberately not changed.** The 48 KB and 13 KB above are
uncompressed source bytes, which is not what a visitor downloads. Every number
below is a differential production build — stub the data out, rebuild, compare
the gzipped total of every client chunk — so it is the real delta, not an
estimate from file sizes:

| | gzipped |
|---|---|
| every client chunk | 274.2 KB |
| what a first paint of `/` actually fetches (10 chunks) | 250.0 KB |
| all i18n data — three dictionaries and three starter sets | 11.7 KB |
| &nbsp;&nbsp;all three dictionaries | 7.6 KB |
| &nbsp;&nbsp;&nbsp;&nbsp;of which `he` + `ru` | 4.1 KB |
| &nbsp;&nbsp;all three starter sets | 4.1 KB |
| &nbsp;&nbsp;&nbsp;&nbsp;of which `he` + `ru` | 3.0 KB |
| **the two thirds this finding is about** | **7.1 KB** |

Each row is its own build. The two halves sum to 11 707 bytes against 11 707
measured together, which is the check that they were not simply subtracted from
one another.

So the prize is 7.1 KB of a 250 KB first load — 2.8%, where two thirds of the
61 KB quoted above reads like forty. Hebrew and Russian are the reason: UTF-8
spends two bytes on every letter and gzip takes almost all of them back. There
is a second reason the two extra dictionaries are so cheap: all three carry the
same ASCII keys, and gzip charges for those once. Dropping `he` and `ru`
saves 4.1 KB, while the remaining English dictionary still costs 3.5 KB on its
own — the first dictionary pays for the key set, the other two pay only for
their values.

That alone would not settle it. What settles it is where the bytes would have to
go instead. The chunk carrying them is served
`Cache-Control: public, max-age=31536000, immutable`, so a visitor pays for it
once per deploy; the document is served `no-store, must-revalidate`, so it is
paid for on every single navigation. Only two mechanisms can split a dictionary
the client needs *synchronously* at hydration:

- **Pass the chosen dictionary from the server as a prop.** It is serialised
  into the flight payload inside the document. The trade is structural rather
  than numerical: three dictionaries leave the immutable chunk once, and one
  comes back on every page load, so break-even is three page views per deploy
  whatever the dictionaries weigh. The measured bytes only say how much is at
  stake — 7.6 KB out, and at least 3.5 KB back each time, since a dictionary
  alone in a 2 KB document has less to compress against than it had among
  250 KB of JavaScript. Anyone who uses the app rather than glancing at it comes
  out behind.
- **`import()` the dictionary in the provider.** The first client render is then
  async, and hydration has to either block or paint the wrong text and correct
  it — the same jump O5 exists to remove, on every string on the screen instead
  of one bubble.

The starter sets look like the exception, because nothing renders them before
mount: `/` returns a loading div until `useUserId` reads localStorage, so
`getRandomSuggestions` has no SSR constraint and could be imported lazily
without a hydration problem at all. It buys 4.1 KB — 1.6% — in exchange for a
second round trip on a cold cache and an empty row where the first thing an
empty chat offers is supposed to be. Not worth it either.

The finding is real; it is simply small, and every way of collecting it costs
more than it returns. Reopen it if the locale ever moves into the URL — a
`[locale]` route segment gets this split for free from the framework, and the
arithmetic changes completely.

### [ ] O7 — The markdown renderer is a sixth of the first load, and is deferrable

Measured while settling O6, by the same differential build: `react-markdown` and
`remark-gfm`, imported at the top of
[`MessageBubble.tsx:4-5`](../../../frontend/src/components/chat/MessageBubble.tsx#L4-L5),
are **42.0 KB gzipped** — 16.8% of the 250 KB first load, and six times
everything O6 could have saved.

Unlike the dictionaries, nothing needs them synchronously. `/` renders a loading
div until `useUserId` resolves, so no markdown is parsed until after mount;
`next/dynamic` would move all 42 KB off the critical path with no hydration
constraint to work around. The cost is a frame where a message body is
unstyled — much easier to hide behind the streaming state than the whole
interface is.

Not done here because it is a different finding from the one O6 states, and it
should be scheduled rather than smuggled in.

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
