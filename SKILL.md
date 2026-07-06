# Workflow Skills — travel-agent

---

## SKILL: dev-start

**When:** Starting local development environment from scratch.

```bash
# 1. Database (if not running)
docker compose up -d

# 2. Apply any pending migrations
cd backend-langgraph && npm run migrate && cd ..

# 3. Start backend(s) + frontend (separate terminals)
npm run dev:backend-lg    # :3002 — primary (LangGraph), actively developed
npm run dev:backend       # :3001 — legacy (ReAct), frozen — only if you need it for comparison
npm run dev:frontend      # :3000
```

---

## SKILL: add-tool

**When:** Adding a new tool to one or both agents.

`backend/` is frozen (see [AGENTS.md](AGENTS.md#backend-status-critical)) — only touch it if the user explicitly asks. Files to update in `backend-langgraph/`:

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
`backend/` is frozen — do NOT copy the migration there unless the user asks (see [AGENTS.md](AGENTS.md#backend-status-critical)).

---

## SKILL: typecheck

**When:** After any change to backend code, before marking a task complete.

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
```

Must pass. `backend/` is frozen — only typecheck it if you actually touched it.

---

## SKILL: run-tests

**When:** After ANY significant change — tools, routes, services, repositories, graph code.

```bash
# TypeScript check (fast, run first)
npx tsc -p backend-langgraph/tsconfig.json --noEmit

# Unit tests only (fast, no DB needed)
npm run test --workspace=backend-langgraph

# All tests including integration (requires test DB)
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
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
5. `backend/` is frozen — implement in `backend-langgraph/` only unless the user asks otherwise

Reference: [backend-langgraph/src/tools/providers/](backend-langgraph/src/tools/providers/)

---

## SKILL: frontend-refactor

**When:** Starting the planned frontend optimization work.

Priority order (see [memory/project_frontend_refactor_plan.md](~/.claude/projects/-home-alexey-Jobs-exams-navan-cognition-AI-assignment-travel-agent/memory/project_frontend_refactor_plan.md)):

**P0 (do first):**
1. Centralize `API_URL` → `src/lib/config.ts`
2. Abort cleanup on unmount in `ChatWindow.tsx`
3. Move shared types to `src/types/agent.ts`
4. Extract `src/lib/fileUtils.ts`, `src/lib/dateUtils.ts`

**P1:** Extract `useStreamChat`, `useChatHistory`, `useFileAttachments`, `useAsync` hooks; replace refresh-counter anti-pattern; add error boundaries.

**P2:** Folder structure, `useReducer` for streaming state, `React.memo`, React Query.

After each P0/P1 item: `cd frontend && npm run build && npm run lint`.
