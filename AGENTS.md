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
| [backend-langgraph/src/i18n/locale.ts](backend-langgraph/src/i18n/locale.ts) | `Locale` type (`en`/`he`/`ru`), `isLocale`, `dirOf`, `LANGUAGE_NAMES` |
| [backend-langgraph/src/tools/BaseTool.ts](backend-langgraph/src/tools/BaseTool.ts) | Base class all tools extend |
| [backend-langgraph/src/tools/wrapTool.ts](backend-langgraph/src/tools/wrapTool.ts) | Wraps tools for LangGraph ToolNode (errors → strings) |
| [backend-langgraph/src/tools/providers/](backend-langgraph/src/tools/providers/) | CalendarProvider, TasksProvider — user-aware delegation |
| [backend-langgraph/src/services/ConversationService.ts](backend-langgraph/src/services/ConversationService.ts) | Message save + async embedding |
| [backend-langgraph/src/services/EmbeddingService.ts](backend-langgraph/src/services/EmbeddingService.ts) | Voyage AI embed + random fallback |
| [backend-langgraph/src/repositories/ConversationRepository.ts](backend-langgraph/src/repositories/ConversationRepository.ts) | All DB: messages, history, vector search |
| [backend-langgraph/src/routes/chat.ts](backend-langgraph/src/routes/chat.ts) | POST /api/chat — SSE streaming endpoint |
| [backend-langgraph/src/routes/auth.ts](backend-langgraph/src/routes/auth.ts) | Google OAuth2 status/callback/disconnect |
| [backend-langgraph/src/db/migrations/](backend-langgraph/src/db/migrations/) | Numbered SQL migrations |
| [backend-langgraph/src/db/backfill-embeddings.ts](backend-langgraph/src/db/backfill-embeddings.ts) | One-time embedding backfill with retry |
| [frontend/src/components/ChatWindow.tsx](frontend/src/components/ChatWindow.tsx) | Main chat UI — SSE consumer, message state |
| [frontend/src/app/settings/page.tsx](frontend/src/app/settings/page.tsx) | Google + iCloud connect/disconnect UI |
| [frontend/src/i18n/](frontend/src/i18n/) | `LanguageProvider`, `useT`, dictionaries (`en`/`he`/`ru`), `translate()` — see the `add-ui-string` recipe in SKILL.md |
| [frontend/src/i18n/direction.ts](frontend/src/i18n/direction.ts) | `MIRROR_UNDER_RTL` — the one class that flips a direction-carrying icon; see the `rtl-check` recipe in SKILL.md |
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
                           language ('en' | 'he' | 'ru', CHECK, default 'en')
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
ENCRYPTION_KEY        # 32-char key for iCloud credential encryption
ALLOWED_ORIGIN        # CORS origin for production
```

---

## Backend Status (CRITICAL)

**`backend-langgraph/` is the only backend.** The original hand-written ReAct implementation lived in `backend/`; it was frozen on 2026-07-06 and **deleted on 2026-08-24**. The code is archived at the git tag `legacy-react-backend` — restore it with `git checkout legacy-react-backend -- backend/` if you ever need to compare implementations.

Any instruction in commit history, old docs, or tests about "applying changes to both backends" is obsolete — there is only one. All changes to tools, prompts, routes, repositories, or services go into `backend-langgraph/`. Run after every change:

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
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
   TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
     npm run test:all --workspace=backend-langgraph
   ```
2. **Run `/code-review`** — MANDATORY after ANY code change or addition, no exceptions.
   Not optional, not "if it looks risky", not only for large changes. A one-line fix
   counts. tsc + green tests are NOT a substitute: they cannot see a test that passes
   against the broken code too, a standards violation, or a spec requirement missed.
   Run it before reporting the task as done, act on every real finding, and state the
   outcome of both axes (Standards / Spec) in the report.
3. **Memory** — update if the task revealed a non-obvious invariant or recurring pattern.
4. **AGENTS.md** — update if a new key file was added, the DB schema changed, or a new tool/agent was introduced.
5. **SKILL.md** — update if the task introduced a new recurring workflow.
