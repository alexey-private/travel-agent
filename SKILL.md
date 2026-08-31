# Workflow Skills — travel-agent

---

## SKILL: dev-start

**When:** Starting local development environment from scratch.

```bash
# 1. Database (if not running)
docker compose up -d

# 2. Apply any pending migrations
cd backend-langgraph && npm run migrate && cd ..

# 3. Start backend + frontend (separate terminals)
npm run dev:backend-lg    # :3002 — LangGraph backend
npm run dev:telegram      # :3003 — Telegram bridge (optional)
npm run dev:frontend      # :3000
```

---

## SKILL: add-tool

**When:** Adding a new tool to one or both agents.

Files to update in `backend-langgraph/`:

1. Create `src/tools/MyTool.ts` extending `BaseTool` — `execute()` returns `{ success, data }` or `{ success: false, error }`, never throws
2. Register in `travelGraph.ts` and/or `shoppingGraph.ts` (pass to `initTravelGraph` / `initShoppingGraph`)
3. Add tool description to `src/agent/prompts.ts` — both `buildTravelAgentSystemPrompt` and `buildShoppingAgentSystemPrompt`
4. Run TypeScript check

Errors in `execute()` must be returned as strings via `wrapTool` — never throw.
**User-aware tools** (Calendar, Tasks): use `CalendarProvider` / `TasksProvider` — extract `userId` from tool input, not from constructor.

---

## SKILL: add-migration

**When:** Adding a new database table, column, or index.

> **CRITICAL:** NEVER run `ALTER TABLE` directly on any database. Always create a migration file first — the test DB uses only migration files to build its schema. A column added directly to production will be missing from tests, causing silent failures.

```bash
# 1. Create migration file (next number, check existing: ls backend-langgraph/src/db/migrations/)
touch backend-langgraph/src/db/migrations/013_my_change.sql

# 2. Write SQL with IF NOT EXISTS guards (migrations run idempotently)
# 3. Apply to dev DB
npm run migrate --workspace=backend-langgraph

# 4. Apply to test DB
docker exec travel-agent-postgres-1 psql -U user -d travel_agent_test -f /path/to/migration.sql
```

Note: `ADD CONSTRAINT IF NOT EXISTS` is not supported in PostgreSQL — use a `DO $$ BEGIN ... END $$` block.

---

## SKILL: typecheck

**When:** After any change to backend code, before marking a task complete.

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
```

Must pass. Also run `npm run typecheck --workspace=backend-telegram` if you touched the bot.

`tsc` reads `@travel-agent/i18n` from `shared/i18n/dist`, which the root
`postinstall` builds. After editing `shared/i18n/src` run
`npm run build:shared` (or any package's `build` / `test:all`, which do it for
you) before trusting a bare `npx tsc`.

---

## SKILL: run-tests

**When:** After ANY significant change — tools, routes, services, repositories, graph code.

```bash
# TypeScript check (fast, run first)
npx tsc -p backend-langgraph/tsconfig.json --noEmit

# Unit tests only (fast, no DB needed)
npm run test --workspace=backend-langgraph

# All tests including integration (requires the test DB: docker compose up -d postgres_test)
# Port 5433, not 5432 — 5432 is the dev database. Pointing at it makes every
# integration test skip silently instead of failing.
TEST_DATABASE_URL="postgresql://user:password@localhost:5433/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph

# Coverage report
npm run test:coverage --workspace=backend-langgraph
```

**Test DB setup** (first time or after Docker restart):
```bash
docker exec travel-agent-postgres-1 psql -U user -d postgres -c "CREATE DATABASE travel_agent_test;"
# Migrations are applied automatically by setupTestDb() in beforeAll
```

Integration tests skip automatically (`it.skip`) if the test DB is unreachable — check `TEST_DB_AVAILABLE` in `.env`.

Unit tests use shared mocks in `tests/helpers/`. Integration tests (`chat.test.ts`, `memory.test.ts`, `conversations.test.ts`, `conversationRepository.test.ts`) hit a real PostgreSQL DB.

---

## SKILL: backfill-embeddings

**When:** After adding `conversation_embeddings` support or suspecting missing embeddings.

```bash
npx tsx backend-langgraph/src/db/backfill-embeddings.ts
```

Runs sequentially (1 message at a time, 300ms gap) with exponential backoff on Voyage AI 429.
Safe to re-run — uses `ON CONFLICT DO NOTHING`.
Check progress:
```bash
node -e "
const { Pool } = require('pg'); require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT (SELECT COUNT(*) FROM conversation_embeddings) embedded, COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM conversation_embeddings ce WHERE ce.message_id = m.id)) missing FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content != \'\'').then(r => { console.log(r.rows[0]); pool.end(); });
"
```

---

## SKILL: google-auth-debug

**When:** "Connect Google Calendar" shows not-connected after OAuth, or agent says "Google account not connected".

Architecture (CURRENT — после фикса 2026-06-29):
- Все tool-репозитории (`google_tokens`, `icloud_tokens`, `user_service_preferences`) хранят токены по **`session_id`** (TEXT), НЕ по internal UUID
- `internalUserId` используется ТОЛЬКО для conversations, messages, user_memories
- Graph state: поле `userId` = `session_id` — это то, что LLM вставляет в tool-вызовы

Цепочка проверки:
1. `auth.ts` callback: `tokenRepo.save(userId, ...)` где `userId` = `session_id` из `state` параметра OAuth
2. `UserAwareCalendarProvider.resolve(userId)` → `prefRepo.get(userId)` → `session_id`
3. `GoogleCalendarProvider` → `tokenRepo.get(userId)` → находит токен по `session_id`
4. Auth callback редиректит на `/settings?google_auth=success`

Если агент говорит "не подключён":
- Проверить, что в системном промпте `userId` = правильный `session_id`
- Проверить запись в `google_tokens` через `SELECT * FROM google_tokens WHERE user_id = '<session_id>'`
- Проверить что `chat.ts` передаёт `userId: sessionId` (не `internalUserId`) в `graph.streamEvents()`

Files: [backend-langgraph/src/routes/auth.ts](backend-langgraph/src/routes/auth.ts), [backend-langgraph/src/routes/chat.ts](backend-langgraph/src/routes/chat.ts), [frontend/src/app/settings/page.tsx](frontend/src/app/settings/page.tsx)

---

## SKILL: debug-empty-chat

**When:** Chat returns empty response or API 400 "tool_use ids without tool_result blocks".

Root causes and fixes:
1. **Empty assistant message saved** → `history.ts` skips messages where `!content && !lm_messages?.length`
2. **Tool throw instead of return** → `wrapTool.ts` must return `"ERROR: ..."` string, not throw
3. **lm_messages mismatch** → `on_chat_model_end` captures tool_calls; `on_tool_end` captures results; `flushLMRound()` pairs them

Check `backend-langgraph/src/graph/history.ts` `historyToMessages()` and `backend-langgraph/src/routes/chat.ts` save logic.

---

## SKILL: add-calendar-provider

**When:** Adding a new calendar/tasks integration (e.g. Apple iCloud, Outlook).

Pattern:
1. Implement `ICalendarProvider` interface in `src/tools/providers/`
2. Add credentials storage migration + repository
3. Add to `CalendarProvider` delegation logic (checks which provider user has connected)
4. Add auth route + frontend settings card

Reference: [backend-langgraph/src/tools/providers/](backend-langgraph/src/tools/providers/)

---

## SKILL: frontend-refactor

**When:** Starting the planned frontend optimization work.

Priority order (see [memory/project_frontend_refactor_plan.md](~/.claude/projects/-home-alexey-Jobs-travel-agent/memory/project_frontend_refactor_plan.md)):

**P0 (do first):**
1. Centralize `API_URL` → `src/lib/config.ts`
2. Abort cleanup on unmount in `ChatWindow.tsx`
3. Move shared types to `src/types/agent.ts`
4. Extract `src/lib/fileUtils.ts`, `src/lib/dateUtils.ts`

**P1:** Extract `useStreamChat`, `useChatHistory`, `useFileAttachments`, `useAsync` hooks; replace refresh-counter anti-pattern; add error boundaries.

**P2:** Folder structure, `useReducer` for streaming state, `React.memo`, React Query.

After each P0/P1 item: `cd frontend && npm run build && npm run lint`.

---

## SKILL: add-ui-string

**When:** Any user-visible text is added to the frontend — a label, a `title`, an `aria-label`, a `placeholder`, or the text of an `alert()`.

1. Add the key to `frontend/src/i18n/locales/en.ts`. Name it `<namespace>.<camelCase>`, where the namespace is the surface it belongs to: `common.*`, `chat.*`, `memory.*`, `conversations.*`, `settings.*`, `calendar.*`, `features.*`, `errors.*`.
2. Add the **same key** to `he.ts` and `ru.ts` with the translated value.
3. Read it in the component with `const t = useT();` → `{t("namespace.key")}`.

`Dictionary` is inferred from `en.ts` and `he.ts`/`ru.ts` are annotated with it, so a missed or misspelled key in either translation is a compile error — `npx tsc -p frontend/tsconfig.json --noEmit` is the check.

Values with a number that changes the shape of the word are declared `as PluralForms` (`one` / `few` / `many` / `other`); selection runs through `Intl.PluralRules`, and `other` is the fallback for a form a locale asks for but the entry lacks. Other interpolation uses `{name}` placeholders passed as `t("key", { name })`.

**Not translated:** `console.*` output, localStorage keys, `data-testid`, CSS class names, `agentType` values, calendar category values, and the names of the external Google/Apple calendars and task lists.

**Hooks and `lib/*`** cannot call `useT()`. A hook takes `t` as a parameter from the component that owns the surface (`useFileAttachments(t)`); a module in `lib/` throws `new ApiError("errors.<key>", status)` and the surface showing the error translates `err.message`.

Component tests render through `renderWithI18n` from `src/__tests__/helpers/renderWithI18n.tsx` — `useT()` throws outside the provider.

---

## SKILL: add-bot-string

**When:** Any text the Telegram bot sends is added — a reply, an error, a command
description, a cron notification.

1. Add the key to `backend-telegram/src/i18n/locales/en.ts`. Name it
   `<namespace>.<camelCase>`, namespaced by the surface: `common.*`, `start.*`,
   `chat.*`, `commands.*`, `history.*`, `location.*`, `connect.*`, `agent.*`,
   `mode.*`, `calendar.*`, `tasks.*`, `clear.*`, `lang.*`, `notify.*`.
2. Add the **same key** to `he.ts` and `ru.ts`. `Dictionary` is inferred from
   `en.ts` and the other two are annotated with it, so a missed key is a compile
   error — `npm run typecheck --workspace=backend-telegram` is the check.
3. Read it in a handler with `const t = await tFor(ctx);` → `t('namespace.key')`.
   Resolve `t` **before** any code that clears `ctx.session.sessionId` (`/clear`),
   because the stored language is looked up by that id.
4. HTML markup (`<b>`, `<i>`, `<code>`) is part of the value, since the reply is
   sent with `parse_mode: 'HTML'`. Keep `&amp;` escaped.

**No `ctx` available?** `notifier/calendar.cron.ts` has recipients but no context —
use `fetchLocale(sessionId)` and the bare `t(locale, key)`. `sse-client.ts` takes
the locale as a field on its request object.

**Not translated:** `console.*` output, the `[My current location: …]` prefix and
the `/calendar` and `/tasks` dispatch prompts — those are messages to the LLM, and
the agent's own `## Language` block makes it answer in the user's language anyway.

---

## SKILL: add-locale

**When:** A fourth language is added.

1. Widen the union in `shared/i18n/src/locale.ts` — `Locale`, `LOCALES`,
   `LOCALE_LABELS` (the label is written in its own script) and `LANGUAGE_NAMES`
   (English, for the system prompt). This is the only definition; nothing else
   declares the set.
2. Ship a migration widening the CHECK constraint on
   `user_service_preferences.language` — see the `add-migration` recipe. A value
   the column rejects is a language nobody can save.
3. Add the dictionary file to every surface that has one:
   `frontend/src/i18n/locales/`, `backend-telegram/src/i18n/locales/`, plus the
   three phrases in `backend-langgraph/src/i18n/notifications.ts` and a pool in
   `backend-telegram/src/data/suggestions.ts`. `Record<Locale, …>` turns each
   omission into a compile error, so let `tsc` enumerate them for you.
4. Teach the two detectors: `FIRST_PERSON_RE` in `MemoryService` (a language it
   cannot read is one whose users accumulate no memory) and `detectReplyLocale`
   (script counting — a language sharing an alphabet with another needs more
   than a script test).
5. `npm run build:shared`, then typecheck and test all four packages.

---

## SKILL: rtl-check

**When:** Any markup is added or changed in the frontend. Hebrew renders the
whole interface right-to-left, so a physical class written today is a mirrored
layout bug tomorrow.

1. Reach for the logical class, never the physical one: `ms-`/`me-` over
   `ml-`/`mr-`, `ps-`/`pe-` over `pl-`/`pr-`, `start-`/`end-` over
   `left-`/`right-`, `text-start`/`text-end`, `border-s-`/`border-e-`,
   `rounded-ss-`/`rounded-se-` over the `-tl-`/`-tr-` corners. Inside a
   `flex`/`grid` container prefer `gap-` over `space-x-`, which does not follow
   `dir`.
2. Sweep for what slipped through:

```bash
grep -rnoE '\b(ml|mr|pl|pr)-(auto|[0-9.]+)\b|\b(left|right)-(auto|full|[0-9.]+)\b|\btext-(left|right)\b|\bspace-x-[0-9.]+\b|\brounded-t[lr]-[a-z0-9]+\b|\bborder-(l|r)-[a-z0-9]+\b' \
  frontend/src --include='*.tsx'
```

Expected: no output. (Write the pattern with the trailing hyphen — a looser
`rounded-(l|r)` also matches `rounded-lg` and buries the real hits.)

3. Two things logical properties do **not** cover:
   - **`translate-x-*`** has no logical form. A panel that slides off-screen
     picks its direction from `useLocale().dir`, as `app/page.tsx` does — get
     it wrong and the "hidden" panel parks on top of the content.
   - **Glyphs.** A back arrow or a sideways chevron carries a direction of its
     own; give it `MIRROR_UNDER_RTL` from `frontend/src/i18n/direction.ts`.
     An icon that means the same thing both ways — a downward chevron, a
     spinner — must not be flipped.
4. Text whose language is not the interface language needs its own direction,
   read off the text rather than off the locale — the agent answers in the
   language of the question, so a Hebrew reply lands in a Russian interface.
   - **A finished message** gets `dir={detectTextDir(content)}` from
     `frontend/src/i18n/detectTextDir.ts`. Not `dir="auto"`: that resolves on
     the first *strong* character, and several emoji are strong left-to-right
     rather than neutral — the regional indicators behind a flag and 💡 among
     them — so one leading emoji left-aligned an entire Hebrew answer.
   - **The composer** keeps `dir="auto"`, which is the right tool for an input:
     it re-resolves as the user types, and there is nothing to detect before
     the first keystroke.
5. Verify in the browser, not only in jsdom. With the app running, switch to
   `עברית` and on each page check `document.documentElement.scrollWidth <=
   document.documentElement.clientWidth`. To confirm an icon actually flipped,
   read `getComputedStyle(el).scale` — Tailwind 4 writes the `scale` property,
   so `transform` stays `none` and looks like a failure when it is not.

## SKILL: pdf-rtl-check

**When:** Anything in `backend-langgraph/src/routes/export.ts` or
`src/utils/bidi.ts` changes. The PDF export writes text in *visual* order, so a
mistake there is invisible to tsc, to the tests that assert the response is a
PDF, and to reading the code.

1. **Do not judge direction with `pdftotext`.** It applies the bidirectional
   algorithm a second time, to text already in visual order, and reports `ב-793`
   where the page correctly shows `397`. Word *coordinates* from
   `pdftotext -bbox` are trustworthy; the characters are not.
2. **Check the order at the point of writing.** Wrap `PDFDocument.prototype.text`,
   collect what it receives, and run each string back through `toVisual(s, 'rtl')`.
   The result must equal the source character for character — the transform is its
   own inverse.
3. **Check the layout by coordinates.** From `pdftotext -bbox`, on an A4 page with
   50pt margins the right margin is at 545.28. Flow text ends there; a list
   (`indent: 15`) ends at 530.28; a blockquote (`indent: 20`) at 525.28. List
   markers and `1.` sit at the line's right end. In a mirrored table, x decreases
   as the markdown column index increases.
4. **Prove left-to-right did not move.** Copy the pre-change renderer out of git
   (`git show HEAD:backend-langgraph/src/routes/export.ts`), rename its exported
   function, render the same English and Russian markdown through both, then:

```bash
pdftoppm -png -r 100 -gray old.pdf old && pdftoppm -png -r 100 -gray new.pdf new
cmp old-1.png new-1.png && echo identical
```

   Use a document with a table, bold text, a list, a blockquote and a code block.
   Anything short of `identical` is a regression, not a rounding difference.
5. Delete the scratch copy of the old renderer before staging.
