# Workflow Skills — travel-agent

---

## SKILL: dev-start

**When:** Starting local development environment from scratch.

```bash
# 1. Database (if not running)
docker compose up -d

# 2. Apply any pending migrations
cd backend-langgraph && npm run migrate && cd ..

# 3. Start backends + frontend (separate terminals)
npm run dev:backend-lg    # :3002 — primary (LangGraph)
npm run dev:backend       # :3001 — secondary (ReAct)
npm run dev:frontend      # :3000
```

---

## SKILL: add-tool

**When:** Adding a new tool to one or both agents.

Files to update in **both** `backend/` and `backend-langgraph/`:

1. Create `src/tools/MyTool.ts` extending `BaseTool` — `execute()` returns `{ success, data }` or `{ success: false, error }`, never throws
2. Register in `travelGraph.ts` and/or `shoppingGraph.ts` (pass to `initTravelGraph` / `initShoppingGraph`)
3. Add tool description to `src/agent/prompts.ts` — both `buildTravelAgentSystemPrompt` and `buildShoppingAgentSystemPrompt`
4. Run both TypeScript checks

**LangGraph only:** errors in `execute()` must be returned as strings via `wrapTool` — never throw.
**User-aware tools** (Calendar, Tasks): use `CalendarProvider` / `TasksProvider` — extract `userId` from tool input, not from constructor.

---

## SKILL: add-migration

**When:** Adding a new database table, column, or index.

```bash
# 1. Create migration file (next number)
touch backend-langgraph/src/db/migrations/012_my_change.sql
cp backend-langgraph/src/db/migrations/012_my_change.sql backend/src/db/migrations/

# 2. Write SQL with IF NOT EXISTS guards
# 3. Apply
cd backend-langgraph && npm run migrate
```

Always use `IF NOT EXISTS` / `IF EXISTS` — migrations run idempotently.
Copy to **both** `backend/` and `backend-langgraph/`.

---

## SKILL: typecheck

**When:** After any change to backend code, before marking a task complete.

```bash
npx tsc -p backend/tsconfig.json --noEmit
npx tsc -p backend-langgraph/tsconfig.json --noEmit
```

Both must pass. If one fails, fix before proceeding.

---

## SKILL: run-tests

**When:** After changes to tools, services, or repositories.

```bash
# Unit tests only (fast, no DB)
cd backend-langgraph && npm run test

# All tests (requires TEST_DATABASE_URL)
cd backend-langgraph && npm run test:all

# With coverage
cd backend-langgraph && npm run test:coverage
```

Unit tests use shared mocks from `tests/helpers/`. Integration tests hit a real DB — set `TEST_DATABASE_URL` in `.env`.

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

**When:** "Connect Google Calendar" button doesn't work or shows not-connected after OAuth.

Key chain to check:
1. `UserService.findOrCreateUser(sessionId)` → internal UUID
2. `GoogleTokenRepository` stores/reads token by **internal UUID** (not session_id)
3. Auth callback redirects to `/settings?google_auth=success`
4. `settings/page.tsx` reads `?google_auth=` param via `useSearchParams` (wrapped in `Suspense`)

Files: [backend-langgraph/src/routes/auth.ts](backend-langgraph/src/routes/auth.ts), [frontend/src/app/settings/page.tsx](frontend/src/app/settings/page.tsx)

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
5. Mirror to both backends

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
