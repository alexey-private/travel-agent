# Agent Context — travel-agent

See [SKILL.md](SKILL.md) for workflow recipes.

---

## Project Role

AI-powered travel & shopping planning assistant. Started as a learning project comparing two backend architectures; has since grown into the production project. `backend-langgraph/` is the only backend — see [Backend Status](#backend-status-critical) below.

Users chat with an agent that searches flights/hotels, manages Google Calendar tasks, and recalls past conversations via vector search.

**Frontend:** `http://localhost:3000`
**Backend (LangGraph):** `http://localhost:3002`
**Telegram bridge:** `http://localhost:3003`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Backend | Fastify, LangGraph StateGraph, `@langchain/anthropic` |
| Telegram bridge | grammY + SSE bridge to backend-langgraph |
| Database | PostgreSQL 16 + pgvector extension |
| Embeddings | Voyage AI `voyage-3-lite` (512 dims) |
| PDF export | pdfkit + `bidi-js` (Unicode Bidirectional Algorithm), DejaVuSans |
| LLM | Anthropic Claude (default) or OpenAI (env-switchable) |
| Auth | Google OAuth2 (Calendar + Tasks), iCloud CalDAV |
| Deployment | Docker Compose (DB), npm workspaces |

---

## Key Files

| File | Purpose |
|------|---------|
| [backend-langgraph/src/graph/travelGraph.ts](backend-langgraph/src/graph/travelGraph.ts) | Travel agent graph + tool registration |
| [backend-langgraph/src/graph/shoppingGraph.ts](backend-langgraph/src/graph/shoppingGraph.ts) | Shopping agent graph + tool registration |
| [backend-langgraph/src/graph/buildGraph.ts](backend-langgraph/src/graph/buildGraph.ts) | Shared graph builder (model → tools → loop) |
| [backend-langgraph/src/graph/history.ts](backend-langgraph/src/graph/history.ts) | Converts DB history to LangChain messages |
| [backend-langgraph/src/agent/prompts.ts](backend-langgraph/src/agent/prompts.ts) | System prompt builders for both agents |
| [shared/i18n/](shared/i18n/) | `@travel-agent/i18n` — `Locale` (`en`/`he`/`ru`), `LOCALES`, `isLocale`, `dirOf`, `LOCALE_LABELS`, `LANGUAGE_NAMES`, `PluralForms`, `perLocale()`, `translate()`. The one definition all three packages import; see [Shared i18n Package](#shared-i18n-package) |
| [shared/i18n/src/perLocale.ts](shared/i18n/src/perLocale.ts) | One `Intl` formatter per locale, built on first use — building one costs ~30× using it, and a list formats every row |
| [backend-langgraph/src/i18n/detectReplyLocale.ts](backend-langgraph/src/i18n/detectReplyLocale.ts) | Which language a finished reply is written in — follow-up suggestions follow the reply, not the setting |
| [backend-langgraph/src/utils/concurrency.ts](backend-langgraph/src/utils/concurrency.ts) | `forEachWithConcurrency` — a fixed pool over a shared cursor, for work that is slow because it is remote; used by the push cron |
| [backend-langgraph/src/utils/bidi.ts](backend-langgraph/src/utils/bidi.ts) | `toVisual`, `wrapToWidth`, `baseDirFor` — logical→visual reordering for the PDF export; see [PDF Direction](#pdf-direction) |
| [backend-langgraph/src/tools/BaseTool.ts](backend-langgraph/src/tools/BaseTool.ts) | Base class all tools extend |
| [backend-langgraph/src/tools/wrapTool.ts](backend-langgraph/src/tools/wrapTool.ts) | Wraps tools for LangGraph ToolNode (errors → strings) |
| [backend-langgraph/src/tools/providers/](backend-langgraph/src/tools/providers/) | CalendarProvider, TasksProvider — user-aware delegation |
| [backend-langgraph/src/services/ConversationService.ts](backend-langgraph/src/services/ConversationService.ts) | Message save + async embedding |
| [backend-langgraph/src/services/EmbeddingService.ts](backend-langgraph/src/services/EmbeddingService.ts) | Voyage AI embed + random fallback |
| [backend-langgraph/src/repositories/ConversationRepository.ts](backend-langgraph/src/repositories/ConversationRepository.ts) | All DB: messages, history, vector search |
| [backend-langgraph/src/routes/chat.ts](backend-langgraph/src/routes/chat.ts) | POST /api/chat — SSE streaming endpoint |
| [backend-langgraph/src/routes/auth.ts](backend-langgraph/src/routes/auth.ts) | Google OAuth2 status/callback/disconnect |
| [backend-langgraph/src/security/internalAuth.ts](backend-langgraph/src/security/internalAuth.ts) | Guards the `tg-` half of the user-id namespace — a Telegram id is public, so it answers only to the bridge; see [Telegram Bridge Authentication](#telegram-bridge-authentication-critical) |
| [backend-langgraph/src/security/rateLimitKey.ts](backend-langgraph/src/security/rateLimitKey.ts) | Who a rate-limited request is counted against — a web caller by address, a bridged `tg-` id by id; see [Rate Limiting](#rate-limiting) |
| [backend-langgraph/src/security/trustProxy.ts](backend-langgraph/src/security/trustProxy.ts) | Which peers may speak for the caller through `X-Forwarded-For` — the `TRUST_PROXY` default, and the warning that fires when the real proxy is missing from it |
| [backend-langgraph/src/security/cors.ts](backend-langgraph/src/security/cors.ts) | Which browser origins may read this API — the `ALLOWED_ORIGIN` allowlist, and the headers the hijacked SSE stream carries across; see [CORS](#cors) |
| [backend-telegram/src/backendAuth.ts](backend-telegram/src/backendAuth.ts) | The bot's half of that guard: `internalHeaders()` on every backend call, `signStartLink()` for the `/connect` link |
| [backend-langgraph/src/db/migrations/](backend-langgraph/src/db/migrations/) | Numbered SQL migrations |
| [backend-langgraph/src/db/backfill-embeddings.ts](backend-langgraph/src/db/backfill-embeddings.ts) | One-time embedding backfill with retry |
| [frontend/src/components/ChatWindow.tsx](frontend/src/components/ChatWindow.tsx) | Main chat UI — SSE consumer, message state |
| [frontend/src/app/settings/page.tsx](frontend/src/app/settings/page.tsx) | Google + iCloud connect/disconnect UI |
| [frontend/src/i18n/](frontend/src/i18n/) | `LanguageProvider`, `useT`, dictionaries (`en`/`he`/`ru`); `config.ts` holds the language cookie only — see the `add-ui-string` recipe in SKILL.md |
| [frontend/src/i18n/detectLocale.ts](frontend/src/i18n/detectLocale.ts) | Browser-language detection — `headerLocale` (server, `Accept-Language`) and `browserLocale` (client, `navigator`); default for a visitor with nothing stored |
| [frontend/src/i18n/direction.ts](frontend/src/i18n/direction.ts) | `MIRROR_UNDER_RTL` — the one class that flips a direction-carrying icon; see the `rtl-check` recipe in SKILL.md |
| [frontend/src/i18n/detectTextDir.ts](frontend/src/i18n/detectTextDir.ts) | Which way a finished chat message reads — a reply follows its own language, not the interface locale, and `dir="auto"` cannot do it (leading emoji are strong LTR) |
| [frontend/src/i18n/useTextDirection.ts](frontend/src/i18n/useTextDirection.ts) | The same question for a message still arriving — counts each chunk once, and while it is still arriving writes no `dir` at all until some letter has come with it; see [Streaming Text Direction](#streaming-text-direction) |
| [backend-telegram/src/i18n/](backend-telegram/src/i18n/) | Bot dictionaries (`en`/`he`/`ru`), `t()`, and `language.ts` — reads/writes the language through `/api/settings`, caches it in the grammY session |
| [backend-telegram/src/commands/lang.ts](backend-telegram/src/commands/lang.ts) | `/lang` — inline keyboard that switches the bot language |
| [backend-telegram/src/data/suggestions.ts](backend-telegram/src/data/suggestions.ts) | `STARTER_POOLS` — starter buttons written per language, not translated |
| [backend-telegram/src/config.ts](backend-telegram/src/config.ts) | `BACKEND_URL`, `BACKEND_PUBLIC_URL` — kept out of `index.ts`, which boots the bot on import |
| [backend-telegram/src/transcribe.ts](backend-telegram/src/transcribe.ts) | A voice note goes to the backend's `/api/transcribe`, not to Whisper — that is where the language hint and the only copy of the OpenAI key live |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Railway deploy: per-service env vars, Dockerfile paths, migration/networking notes |
| [Dockerfile.backend-langgraph](Dockerfile.backend-langgraph), [Dockerfile.backend-telegram](Dockerfile.backend-telegram), [Dockerfile.frontend](Dockerfile.frontend) | Multi-stage builds, root-context (npm workspaces) |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | tsc + tests (real pgvector service container) on push/PR to main |

---

## Agent Types

| Agent | Route param | Tools |
|-------|------------|-------|
| `travel` | `agentType: 'travel'` | web_search, weather, flights, hotels, currency, country_info, visa_requirements, car_rental, tours, spa, manage_calendar, manage_tasks, search_conversations |
| `shopping` | `agentType: 'shopping'` | web_search, currency, manage_calendar, manage_tasks, search_conversations, + shopping-specific tools |

---

## Shared i18n Package

`shared/i18n` is a fourth npm workspace, `@travel-agent/i18n`. It holds what all
three packages agreed on and used to copy: the `Locale` union and `LOCALES`,
`DEFAULT_LOCALE`, `isLocale`, `dirOf`, `LOCALE_LABELS`, `LANGUAGE_NAMES`, the
`PluralForms` / `Entry` / `TVars` shapes, `perLocale()` and `translate()`.

`translate()` takes an optional `escape` applied to interpolated values and never
to the template. The bot passes `escapeHtml` because its templates are HTML and
its values routinely are not ours; the frontend passes nothing, because React
escapes for it and pre-escaped text would render as entity references. A surface
that starts rendering its output as markup must pass one.

**What stays in the packages.** The dictionaries themselves (each surface has its
own key set), the language cookie (`frontend/src/i18n/config.ts`), the grammY
session cache (`backend-telegram/src/i18n/language.ts`), the bot's `t()` wrapper,
`detectLocale` / `detectTextDir` / `detectReplyLocale`, `MIRROR_UNDER_RTL`, and
the notification copy. The shared package knows about languages, not about
surfaces — nothing in it may import from a consumer.

- **Adding a locale is now two edits, not four:** `shared/i18n/src/locale.ts` and
  a migration widening the CHECK constraint on
  `user_service_preferences.language`. Each package then needs its own new
  dictionary file, which the compiler demands.
- **Consumers import the built output, not the source.** The root `postinstall`
  compiles it, so a plain `npm ci` is enough; `prebuild` / `pretest:all` hooks in
  the three packages recompile it so an edit to `shared/i18n/src` can never be
  tested through a stale `dist`.
- **The Docker runtime stages install with `--ignore-scripts`** and copy
  `shared/i18n/dist` from the build stage — `--omit=dev` leaves no TypeScript for
  the `postinstall` to run. The base stage copies `shared/` whole, because
  `npm ci` needs its sources. The frontend needs neither: Next bundles the
  package into the server chunks.

---

## Agent Language

`language` reaches the agent from `POST /api/chat` and lands in `AgentState`, which
feeds the `## Language` block of both system prompts. Precedence is
`body.language` → `prefs.language` → `DEFAULT_LOCALE`; a body value that differs
from the stored one is written back without blocking the stream.

The same value goes to `SuggestionService`, to `MemoryService` (extraction), and to
`POST /api/transcribe` as a Whisper hint — from the web mic button and from the
Telegram bot alike, since both now reach Whisper through that one route.

Four rules that are easy to break:

- **The message outranks the setting.** The prompt tells the agent to answer in the
  language of the user's latest message, so a Hebrew-configured user who writes in
  English gets an English answer. Follow-up suggestions must therefore be generated
  for the language of the *reply* (`detectReplyLocale`), not the stored preference.
- **Voice goes through the backend.** The hint exists because Whisper mis-detects
  short Hebrew clips and returns them transliterated into Latin. A surface that
  calls Whisper itself gets the mis-detection back, which is exactly what the bot
  did until it was routed through `/api/transcribe`; anything transcribing audio
  from now on asks that route rather than growing a third copy of the key.
- **Tool strings stay English.** Errors and results in `src/tools/**` are a contract
  with the model, and ~50 tests assert their exact English text. The prompt makes the
  agent retell them in the user's language instead of surfacing them raw.
- **Memory keys stay English.** Deduplication matches on the key (`home_city`,
  `diet`), so only memory *values* follow the user's language. `FIRST_PERSON_RE`
  gates extraction and must recognise every supported language — one it cannot read
  is one whose users never accumulate any memory.

---

## Telegram Bot Language

The bot stores nothing of its own: the language lives in `user_service_preferences`
under the same `tg-<telegram user id>` the web app would use, so `/lang` and the
web language switcher move the same value. The grammY session holds only a
per-process cache (`session.locale`), refetched after a restart.

- **The bot never sends `language` in the `/api/chat` body.** A body value is
  treated as the user's newest choice and written back, so a session cache that
  went stale after a switch on the web would overwrite the fresher value. The
  backend reads the stored preference under the same id anyway.
- **A failed settings read is not cached.** `getLocale` caches a real answer only —
  caching the English fallback would outlive the blip and keep answering the wrong
  language until the process restarts.
- **The native command menu follows the Telegram client's language, not ours.**
  `setMyCommands` is registered per `language_code` plus a default set; a user whose
  Telegram UI is English sees English command descriptions even after picking
  Hebrew. The bot's own replies still follow the stored value. Telegram offers no
  other scope.
- **Starter buttons are written, not translated.** Each entry in `STARTER_POOLS` is
  both a button label and the message sent to the LLM, so every locale gets its own
  natural routes and currencies. A test caps each at 64 UTF-8 bytes — roughly 30
  characters once Hebrew or Cyrillic takes two bytes each.

---

## Error Responses

HTTP error responses carry a snake_case `code` next to the English `error`. The
frontend translates by `code` (`errors.<code>` in the dictionaries) on the two paths
that have no agent to translate for them: Apple iCloud connect and Drive export.

The `error` string is written by us and never forwarded from an upstream service.
A CalDAV or provider message is written for whoever runs the server — it can name
accounts, collection URLs and raw upstream responses — so it goes to `req.log.error`
and the caller gets a fixed sentence plus the `code`.

`/api/chat` is the one place that still passes a raw `err.message` outward, over
its SSE `error` event. It reaches Telegram users verbatim (the bot renders it
through `chat.failed`) and reaches web users not at all — the frontend's
`AgentEvent` union has no `error` variant, so the browser parses the event and
drops it. Both halves of that are open, not intended; see S8 in the security
audit findings.

---

## Push Notification Language

The daily reminder cron notifies every subscriber in one pass, so the language has
to be per-user, not per-process. It comes out of the subscription query itself —
`LEFT JOIN user_service_preferences p ON p.user_id = u.session_id` — rather than a
second round trip per person.

- **`LEFT JOIN`, never `JOIN`.** A push subscription exists whether or not the
  person ever opened `/settings`. An inner join would silently stop notifying
  everyone who has no preferences row.
- **A `NULL` language is English, not a crash.** `isLocale` gates the raw column;
  anything it rejects falls back to `DEFAULT_LOCALE`.
- **Only the wrapping is translated.** The title and the overflow line follow the
  locale; event and task titles are the user's own words and are passed through
  untouched.
- **The clock is 24-hour in every language, app-wide.** `formatEventTime` passes
  `hourCycle: 'h23'`, so English does not drift to "02:30 PM" — the calendar sends
  24-hour times and existing subscribers keep seeing them. The locale still decides
  separator and digits. The rule is not local to notifications: `formatDate` in
  [frontend/src/lib/dateUtils.ts](frontend/src/lib/dateUtils.ts) pins the same
  cycle, so a conversation timestamp and a reminder about it agree. These two are
  the only places in the repo that format a clock time — any third must pin it too.
- **The run is five people wide, not one.** Each subscriber costs two provider
  calls, and awaiting them in a plain `for` loop made the run as long as the sum
  of everyone's round trips. `forEachWithConcurrency` holds five in flight; the
  number is a ceiling on requests to Google, not on local work, which is why it
  is five and not fifty. Within one person the sends stay sequential — those are
  their own two or three devices.
- **"Tomorrow" is counted on the server's local calendar, start to finish.**
  `tomorrowDate` used to add a day locally and render it with `toISOString()`,
  which renders in UTC: at the default 09:00 run, every server more than nine
  hours ahead of UTC reported *today* — Adelaide at UTC+9:30 included — and a
  late run west of UTC reported the day after next. Local is the right of the two clocks available — the cron fires on local
  time and a calendar's all-day dates are local to whoever wrote them. The
  timezone cannot be changed from inside a jest test (the copied `process` never
  reaches the setter that makes V8 forget the cached zone), so the boundary is
  covered by a child process per timezone; see
  [tests/helpers/printTomorrow.ts](backend-langgraph/tests/helpers/printTomorrow.ts).
- The copy lives in [backend-langgraph/src/i18n/notifications.ts](backend-langgraph/src/i18n/notifications.ts) —
  three phrases, deliberately not a frontend-sized dictionary. These are the only
  strings in this package that reach a person without passing through the agent or
  the frontend.

---

## PDF Direction

pdfkit paints glyphs in string order and implements no part of the Unicode
Bidirectional Algorithm, so Hebrew handed to it verbatim comes out backwards.
`POST /api/export/pdf` and `/api/export/pdf-to-drive` take an optional `language`;
`baseDirFor` turns it into one direction for the whole document, falling back to
sniffing the text when no language is sent.

Three rules that are easy to break:

- **Wrap first, reorder second.** The algorithm is defined per *visual* line.
  Reordering a paragraph and letting pdfkit wrap the result slices reversed text
  at an arbitrary point and scrambles every line, so `wrapToWidth` decides the
  breaks and `toVisual` runs on each line separately.
- **Left-to-right must stay byte-identical.** `write()` is a bare pass-through for
  `ltr`. English and Russian exports are verified to rasterise pixel-for-pixel the
  same as before the feature existed — treat any diff there as a bug.
- **Markers are written logically.** `• text`, `1. text` — the algorithm moves
  them to the right edge on its own. Repositioning them by hand double-flips them.

The five DejaVu faces are parsed once for the life of the process and the parsed
faces — not their paths, and not their bytes — are what `registerFont` receives.
pdfkit reopens a path for every document, and reading the file is the cheap half:
the cost is the tables, cmap processor and glyph cache fontkit memoises on the
face and discards with the document. An export costs 28.5 ms with paths, 27.3 ms
with buffers, 4.2 ms with shared faces. Sharing is safe because every document
gets its own subset and layout cache.

Indentation under `rtl` comes off a narrower column, not from pdfkit's `indent`,
which only ever pushes from the left. Bold is dropped inside right-to-left text:
emphasis needs `continued`, which cannot coexist with breaking the lines
ourselves. Code blocks stay left-to-right always.

---

## Streaming Text Direction

A chat message arrives a chunk at a time, and its direction is a property of the
whole of it, so every render before the last one is answering the question from a
prefix. [useTextDirection.ts](frontend/src/i18n/useTextDirection.ts) is where that
is handled; [detectTextDir.ts](frontend/src/i18n/detectTextDir.ts) still holds the
rule itself, and after this change is called only from tests — where it doubles as
the yardstick the hook's incremental counting is checked against.

- **Nothing is said until a letter arrives.** `# 🇯🇵` holds no letter of any
  script. Answering `ltr` there left-aligned the bubble and then jumped it right
  as soon as the first Hebrew letter landed. The hook returns
  `undefined` instead, no `dir` attribute is written, and the bubble inherits the
  document direction that `<html dir>` carries from the interface locale. That is
  a provisional answer and the text overrules it — which is the same rule the
  agent's own language follows.
- **Only a message still arriving may go without a direction.** The hook takes
  `streaming` for this. A finished message with no letters — a price, an emoji —
  is not waiting for evidence, it is the whole message, and it stays `ltr` as it
  always was. Leaving it undirected would hand it to the interface locale
  permanently, and switching languages would re-align a bubble already read.
- **Real evidence is still read as evidence.** A reply opening `JST — Japan
  Standard Time` is left-to-right from its third character and flips when the
  Hebrew arrives. That flip is not a bug and cannot be removed without waiting
  for the whole message.
- **Each chunk is counted once.** Two regex passes over a string that grows with
  every chunk is quadratic: 16 ms across a 5 KB reply, 1.8 s across a 50 KB one.
  The hook adds only the tail — safe because neither pattern can match across a
  join — and checks with `startsWith` that the text really does extend what it
  counted, recounting when it does not. The check costs a sixth to a fortieth of
  the scan it replaces, and it is what makes the append-only assumption a check
  rather than a hope.
- **The ref is written during render, deliberately.** It is a cache whose value
  is a pure function of the text, so a discarded render cannot leave it wrong.
  `react-hooks/refs` is disabled for the body and re-enabled after it; state
  instead would re-render on every chunk to report what the same render already
  knows.

---

## Telegram Bridge Authentication (CRITICAL)

A web session id is `crypto.randomUUID()` — unguessable, and unguessability is
the whole of its security: any request naming it is served. A Telegram session
id is `tg-<telegram user id>`, derived from a public integer, so the same design
protects one half of the namespace and exposes the other.

`INTERNAL_API_SECRET`, held by `backend-langgraph` and `backend-telegram` alike,
is what closes it. Three rules follow:

- **Every bot→backend call carries `internalHeaders()`.** One that forgets is
  not subtly wrong, it is a 403. The header is checked by a global `preHandler`
  hook that fires whenever a request names a `tg-` id in its params, query or
  body — so a new route needs no opt-in, and a new bot call does need the header.
- **`/api/users/telegram` is bridge-only regardless of ids.** It returns every
  Telegram session id in the database; unauthenticated, it handed an attacker
  the list of victims.
- **The `/connect` link is signed, not headered.** A browser follows it, so the
  proof travels in the query string (`exp` + `sig` over id, platform and
  expiry). The two OAuth routes are exempt from the hook for exactly this
  reason, and `state` is separately signed with the Google client secret so the
  callback cannot be retargeted at another user's id.

Missing secret ⇒ the backend logs an error at boot and answers 503 for anything
Telegram-scoped. It fails closed on purpose: the alternative is a silent
reopening of the hole.

---

## Rate Limiting

Four routes are limited — `/api/chat` (30/min), `/api/transcribe` (20/min) and
each of the two PDF exports (10/min each) — and all four ask
[rateLimitKey.ts](backend-langgraph/src/security/rateLimitKey.ts) the same
question: who does this count against?

- **A web `userId` never appears in the key.** It arrives in the request body and
  nothing attests to it, so keying on it means a fresh budget per invented id.
  Combining it with the address is the same bug with extra steps — it multiplies
  the budget instead of replacing it. Web callers are counted by address.
- **A `tg-` id is keyed by id, and only because the bridge vouched for it.**
  `registerInternalAuth` is a global `preHandler`, so it rejects an unattested
  `tg-` request before the route-level limiter ever computes a key. Counting
  Telegram traffic by address would put the whole bot in one bucket — it all
  arrives from the one bridge process.
- **`TRUST_PROXY` is what makes the address real.** Behind an untrusted proxy
  every web user is one caller, and the limit turns into an outage; the backend
  logs a warning the first time it sees that. Fastify 5 refuses a numeric hop
  count (it fails closed to trusting nothing), so trust is expressed as peer
  addresses or ranges — only the entry the trusted peer appended is believed.
  Widening it to ranges a client can arrive from undoes the fix: `req.ip` then
  takes the *first* entry of `X-Forwarded-For`, which is whatever the caller
  wrote. The default lives in
  [trustProxy.ts](backend-langgraph/src/security/trustProxy.ts).

Every 429 carries `code: 'rate_limited'`; the export and voice paths surface it
to the user directly, with no agent in between to retell it.

---

## CORS

A request to this API proves nothing about who sent it — it carries a `userId`
in its body and no credential at all — so the origin check is the whole of what
keeps an unrelated page in the user's browser from making one.
[cors.ts](backend-langgraph/src/security/cors.ts) holds it.

- **An allowlist, never a reflection.** `ALLOWED_ORIGIN` is comma-separated and
  required in production; the process refuses to start without it, because the
  alternatives are refusing every browser and trusting all of them. Development
  gets `localhost` on any port instead — the frontend's own port already makes
  it cross-origin. An origin outside the list is not rejected, it simply gets no
  `Access-Control-Allow-Origin`, so nothing outside a browser is affected and
  the Telegram bridge, which sends no `Origin`, needs no entry.
- **The hijacked stream copies the decision, it does not make one.**
  `/api/chat` calls `reply.hijack()` and writes its own headers, so the ones the
  CORS plugin set on the reply would otherwise be dropped; `hijackedCorsHeaders`
  carries them over. Deciding a second time is precisely how that route came to
  reflect the caller's own `Origin` while the plugin refused it.
- **`Access-Control-Allow-Credentials` is never sent.** Nothing here
  authenticates by cookie, and that header is what would turn a mistake in the
  list into a way to read a signed-in user's stream.

---

## Database Schema (key tables)

```
users                — internal UUID ↔ session_id mapping
conversations        — user_id (UUID FK), agent_type
messages             — conversation_id, role, content, agent_steps, lm_messages
conversation_embeddings — message_id, user_id (UUID FK), agent_type, embedding vector(512)
user_memories        — user_id (UUID FK), key, value, agent_type
google_tokens        — user_id TEXT = session_id, access_token, refresh_token, expiry
icloud_tokens        — user_id TEXT = session_id, encrypted credentials
user_service_preferences — user_id TEXT = session_id, calendar_provider, calendar_name,
                           shopping_calendar_name, task_list_name, shopping_task_list_name,
                           language ('en' | 'he' | 'ru' | NULL, CHECK; NULL = never chosen)
push_subscriptions   — user_id UUID FK → users.id, endpoint, p256dh, auth
```

---

## userId vs internalUserId (CRITICAL)

Два типа идентификаторов пользователя:
- **`session_id`** (TEXT, из localStorage браузера) — используется как `userId` во всех tool-репозиториях
- **`internalUserId`** (UUID, `users.id` PK) — используется только для conversations, messages, user_memories

| Таблица | Ключ |
|---------|------|
| `google_tokens` | `session_id` |
| `icloud_tokens` | `session_id` |
| `user_service_preferences` | `session_id` |
| `push_subscriptions` | `users.id` (UUID FK, каскадное удаление) |
| `conversations` | `users.id` (UUID FK) |
| `user_memories` | `users.id` (UUID FK) |

**Graph state** содержит поле `userId` — в него записывается `session_id`. LLM получает `userId` из системного промпта и передаёт в tool-вызовы.

---

## Environment Variables

```bash
DATABASE_URL          # PostgreSQL connection string (required)
ANTHROPIC_API_KEY     # or OPENAI_API_KEY
LLM_PROVIDER          # 'anthropic' (default) | 'openai'
TAVILY_API_KEY        # Web search (required)
OPENWEATHER_API_KEY   # Weather tool (required)
VOYAGE_API_KEY        # Embeddings (optional — random fallback in dev)
GOOGLE_CLIENT_ID      # OAuth2
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
ENCRYPTION_KEY        # >=32 chars; iCloud credential encryption. Required when NODE_ENV=production
ALLOWED_ORIGIN        # Browser origins allowed to read this API, comma-separated.
                      # Required when NODE_ENV=production
```

---

## Backend Status (CRITICAL)

**`backend-langgraph/` is the only backend.** The original hand-written ReAct implementation lived in `backend/`; it was frozen on 2026-07-06 and **deleted on 2026-08-24**. The code is archived at the git tag `legacy-react-backend` — restore it with `git checkout legacy-react-backend -- backend/` if you ever need to compare implementations.

Any instruction in commit history, old docs, or tests about "applying changes to both backends" is obsolete — there is only one. All changes to tools, prompts, routes, repositories, or services go into `backend-langgraph/`. Run after every change:

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5433/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

---

## Migration Rule (CRITICAL)

**NEVER alter the production database directly.** Schema changes MUST go through migration files:

```bash
# 1. Create migration file first
touch backend-langgraph/src/db/migrations/013_my_change.sql
# 2. Write SQL with IF NOT EXISTS guards
# 3. Apply to dev/test DB, then prod
npm run migrate --workspace=backend-langgraph
```

If a column exists in production but has no migration file — it will be missing from the test DB, breaking integration tests.

---

## After Each Task (MANDATORY CHECKLIST)

1. **Run tsc + tests** — non-negotiable after any code change:
   ```bash
   npx tsc -p backend-langgraph/tsconfig.json --noEmit
   TEST_DATABASE_URL="postgresql://user:password@localhost:5433/travel_agent_test" \
     npm run test:all --workspace=backend-langgraph
   ```
2. **Run `/code-review`** — MANDATORY after ANY code change or addition, no exceptions.
   Not optional, not "if it looks risky", not only for large changes. A one-line fix
   counts. tsc + green tests are NOT a substitute: they cannot see a test that passes
   against the broken code too, a standards violation, or a spec requirement missed.
   Run it before reporting the task as done, act on every real finding, and state the
   outcome of both axes (Standards / Spec) in the report.
3. **Say where the work landed** — a worktree job ends with its branch pushed, and a
   push is housekeeping, not delivery: the Stop hook pushes the branch so the session
   can be deleted, and it does not merge. Report the landing state in as many words:
   ```bash
   git merge-base --is-ancestor HEAD github/main   # exit 0 = in main
   git log --oneline github/main..HEAD             # what is not
   ```
   Either "in `main`" or "N commits on `<branch>`, NOT in `main` — not deployed".
   Never let "pushed" be the last word, and record *where it landed* in any memory
   file or spec checkbox that marks the work done. This is not hypothetical: the
   entire 2026-08-30 security audit sat pushed-but-unmerged for a day while being
   reported as finished. `git branch -r --no-merged github/main` finds candidates,
   but over-reports — compare content, not commit SHAs, before raising one.
4. **Memory** — update if the task revealed a non-obvious invariant or recurring pattern.
5. **AGENTS.md** — update if a new key file was added, the DB schema changed, or a new tool/agent was introduced.
6. **SKILL.md** — update if the task introduced a new recurring workflow.
