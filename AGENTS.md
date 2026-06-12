# Agent Context — travel-agent

See [SKILL.md](SKILL.md) for workflow recipes.

---

## Project Role

AI-powered travel & shopping planning assistant with two parallel backends and a Next.js frontend.
Users chat with an agent that searches flights/hotels, manages Google Calendar tasks, and recalls past conversations via vector search.

**Frontend:** `http://localhost:3000`
**Backend (LangGraph):** `http://localhost:3002` (primary)
**Backend (ReAct):** `http://localhost:3001`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Backend (primary) | Fastify, LangGraph StateGraph, `@langchain/anthropic` |
| Backend (secondary) | Fastify, custom ReAct loop, Anthropic SDK |
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
conversations        — user_id, agent_type
messages             — conversation_id, role, content, agent_steps, lm_messages
conversation_embeddings — message_id, user_id, agent_type, role, embedding vector(512)
user_memories        — user_id, key, value (agent preferences)
google_tokens        — user_id, access_token, refresh_token, expiry
icloud_tokens        — user_id, encrypted credentials
user_preferences     — user_id, task_list_name, shopping_task_list_name
```

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

## Two-Backend Rule (CRITICAL)

All changes to tools, prompts, routes, repositories, or services **must be mirrored** to both `backend/` and `backend-langgraph/`. Run both TypeScript checks after every change:

```bash
npx tsc -p backend/tsconfig.json --noEmit
npx tsc -p backend-langgraph/tsconfig.json --noEmit
```

---

## After Each Task

1. **Memory** (`~/.claude/projects/.../memory/`) — update if the task revealed a non-obvious invariant, a new bug class, or a recurring pattern.
2. **AGENTS.md** — update if a new key file was added, the DB schema changed, or a new tool/agent was introduced.
3. **SKILL.md** — update if the task introduced a new recurring workflow.
