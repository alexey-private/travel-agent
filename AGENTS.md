# Agent Context — travel-agent

See [SKILL.md](SKILL.md) for workflow recipes.

---

## Project Role

AI-powered travel & shopping planning assistant. Started as a learning project comparing two backend architectures; has since grown into the production project. `backend-langgraph/` is now the only actively developed backend — see [Backend Status](#backend-status-critical) below.

Users chat with an agent that searches flights/hotels, manages Google Calendar tasks, and recalls past conversations via vector search.

**Frontend:** `http://localhost:3000`
**Backend (LangGraph):** `http://localhost:3002` — primary, actively developed
**Backend (ReAct):** `http://localhost:3001` — legacy, frozen (see below)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Backend (primary) | Fastify, LangGraph StateGraph, `@langchain/anthropic` |
| Backend (legacy, frozen) | Fastify, custom ReAct loop, Anthropic SDK — no longer updated |
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
user_preferences     — user_id TEXT = session_id, task_list_name, shopping_task_list_name
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

**`backend-langgraph/` is the only actively maintained backend.** As of 2026-07-06, `backend/` (the original ReAct implementation) is frozen — kept around for reference/comparison but not receiving updates. It will eventually be deleted or left as-is; no decision has been made yet.

**Do NOT mirror changes to `backend/`** unless the user explicitly asks for it. This supersedes any earlier "apply to both backends" convention baked into commit history, tests, or old docs. All changes to tools, prompts, routes, repositories, or services go into `backend-langgraph/` only. Run after every change:

```bash
npx tsc -p backend-langgraph/tsconfig.json --noEmit
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

If a task seems to require touching `backend/` (e.g. a shared migration file under `backend/src/db/migrations/`), ask the user first rather than assuming it should be kept in sync.

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
   (Only run `backend/`'s tsc/tests if a change actually touched `backend/` — it's frozen, see Backend Status above.)
2. **Memory** — update if the task revealed a non-obvious invariant or recurring pattern.
3. **AGENTS.md** — update if a new key file was added, the DB schema changed, or a new tool/agent was introduced.
4. **SKILL.md** — update if the task introduced a new recurring workflow.
