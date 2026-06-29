# AI Travel & Shopping Agent

A full-stack AI assistant with two specialized agents — **Travel** and **Shopping** — that share the same architecture. Both agents support **Anthropic Claude** and **OpenAI GPT-4o** as interchangeable backends, use a **ReAct loop** (Reason → Act → Observe → Respond), remember user preferences across sessions, and retrieve curated knowledge via **Agentic RAG**.

```
┌────────────────────────────────────────────────────────┐
│  [ ✈ Travel ]  [ 🛍 Shopping ]      [Your Preferences] │
├──────────────────────────────────┬─────────────────────┤
│                                  │ Home: SF            │
│  [user]                          │ Airline: United     │
│  Plan a trip to Tokyo in April   │ Diet: vegetarian    │
│                                  │ Budget: mid         │
│  [assistant]                     └─────────────────────┘
│  ▼ Agent is thinking...
│    web_search: "Tokyo April weather visa"
│       ✓ 5 results
│    get_weather: "Tokyo"
│       ✓ 18°C, partly cloudy
│
│  Here's your personalized Tokyo plan...
│
├────────────────────────────────────────────────────────┤
│  [message input]                        [Send]          │
└────────────────────────────────────────────────────────┘
```

---

## Features

### Core
- **Two AI agents** — Travel (flights, hotels, weather, visa, car rental, tours, spa) and Shopping (product search, price comparison, deal finder)
- **Dual LLM support** — Anthropic Claude (default) or OpenAI GPT-4o, switchable via env var
- **Two backend implementations** — hand-written ReAct loop (`backend/`) and LangGraph StateGraph (`backend-langgraph/`, primary)
- **Long-term memory** — preferences extracted after every turn, injected into system prompt on next request
- **Agentic RAG** — semantic search over curated knowledge base (pgvector, Voyage AI)
- **Conversation history** — full session persistence with title extraction and sidebar navigation
- **Multimodal input** — image and PDF file uploads (Anthropic native PDF support)
- **Follow-up suggestions** — Claude Haiku generates contextual next-question chips after each response

### Calendar & Tasks
- **Google Calendar integration** — OAuth2 (Calendar + Tasks scopes); events saved to a dedicated "Travel Agent" or "Shopping" calendar; tasks saved to named Google Tasks lists
- **Apple iCloud integration** — CalDAV via tsdav, VEVENT and VTODO; AES-256-GCM credential encryption; selectable Reminders list
- **Provider switching** — user can switch between Google and Apple at any time from `/settings`
- **Calendar page** (`/calendar`) — view upcoming events and tasks from the connected provider

### Notifications
- **Telegram Bot** (`backend-telegram/`) — full chat via grammY; photo, voice (Whisper transcription), and location message support; `/history`, `/tasks`, `/remind` commands
- **Web Push Notifications** — VAPID-based browser push; daily morning digest of tomorrow's events and tasks

### Settings
- **Settings page** (`/settings`) — connect/disconnect Google and iCloud accounts, choose calendar provider, name task lists, manage push notification subscription

---

## Architecture

```
.
├── docker-compose.yml              # PostgreSQL 16 + pgvector
├── .env                            # All secrets (single root env file)
├── package.json                    # npm workspaces root
├── backend/                        # ReAct agent (secondary, port 3001)
├── backend-langgraph/              # LangGraph agent (primary, port 3002)
├── backend-telegram/               # Telegram bot bridge (port 3003)
└── frontend/                       # Next.js 14 App Router (port 3000)
```

### Component diagram

```
Browser (Next.js 14)
    │
    ├── /                    Chat interface (Travel / Shopping)
    ├── /calendar            Calendar + Tasks view
    ├── /settings            Google OAuth, iCloud CalDAV, notification prefs
    │
    └─── API calls ──────────────────────────────────────────────────►
                                                                       │
Fastify (backend-langgraph, port 3002)                                 │
    ├── POST /api/chat          SSE streaming, LangGraph graph         │
    ├── GET  /api/conversations  Conversation list                     │
    ├── GET  /api/memory         User preferences                      │
    ├── GET  /api/calendar       Events + tasks (Google or Apple)      │
    ├── GET  /api/settings       User settings                         │
    ├── GET  /auth/google/start  OAuth2 redirect                       │
    ├── POST /auth/apple/connect iCloud credential validation          │
    ├── POST /api/push/subscribe Browser push subscription             │
    └── GET  /api/users          User profile                          │
         │                                                             │
         ├── LangGraph StateGraph                                       │
         │     ├── reason node  (Claude Sonnet / GPT-4o)              │
         │     ├── ToolNode     (prebuilt LangGraph executor)         │
         │     └── shouldContinue edge                                 │
         │                                                             │
         ├── Travel tools                                              │
         │     ├── web_search         Tavily API                      │
         │     ├── weather            OpenWeatherMap                   │
         │     ├── flights            deterministic mock               │
         │     ├── hotels             deterministic mock               │
         │     ├── car_rental         deterministic mock               │
         │     ├── tours              deterministic mock               │
         │     ├── spa                deterministic mock               │
         │     ├── visa_requirements  RestCountries + static data      │
         │     ├── country_info       RestCountries API                │
         │     ├── currency           Frankfurter API                  │
         │     ├── manage_calendar    UserAwareCalendarProvider        │
         │     ├── manage_tasks       UserAwareTasksProvider           │
         │     └── search_conversations  pgvector RAG                  │
         │                                                             │
         ├── Shopping tools                                            │
         │     ├── web_search, currency, manage_calendar, manage_tasks │
         │     ├── product_search     deterministic mock catalog       │
         │     ├── price_compare      multi-retailer mock              │
         │     ├── product_reviews    seeded review pool mock          │
         │     └── deal_search        deals catalog mock               │
         │                                                             │
         ├── Services                                                  │
         │     ├── ConversationService  save + embed messages         │
         │     ├── MemoryService        preference extraction (Haiku)  │
         │     ├── RAGService           semantic retrieval gate        │
         │     ├── EmbeddingService     Voyage AI / random fallback    │
         │     └── SuggestionService    follow-up chips (Haiku)       │
         │                                                             │
         └── Providers                                                 │
               ├── UserAwareCalendarProvider  → Google or Apple        │
               ├── GoogleCalendarProvider     googleapis SDK           │
               ├── AppleCalendarProvider      tsdav CalDAV             │
               ├── UserAwareTasksProvider     → Google or Apple        │
               ├── GoogleTasksProvider        googleapis Tasks API     │
               └── AppleTasksProvider         tsdav VTODO              │

Telegram Bot (backend-telegram, port 3003)
    ├── grammY bot framework
    ├── SSE bridge → backend-langgraph /api/chat
    ├── Photo handler   (download → base64 → multimodal message)
    ├── Voice handler   (OGG → PCM → Whisper transcription)
    ├── Location handler (reverse geocoding → travel context)
    └── Cron: daily calendar digest → Telegram message

PostgreSQL 16 + pgvector
    ├── users                  session_id ↔ internal UUID
    ├── conversations          user_id (UUID), agent_type
    ├── messages               role, content, agent_steps, lm_messages
    ├── conversation_embeddings  vector(512), cosine similarity search
    ├── user_memories          key/value preferences, agent_type-scoped
    ├── google_tokens          OAuth2 tokens, keyed by session_id
    ├── icloud_tokens          AES-256-GCM encrypted credentials
    ├── user_service_preferences  calendar provider, task list names
    ├── knowledge_base         seeded RAG documents, vector(512)
    └── push_subscriptions     VAPID endpoint + p256dh + auth keys
```

---

## LangGraph Backend (`backend-langgraph`, primary)

`backend-langgraph` is the **primary** implementation using **LangChain / LangGraph** StateGraph. The REST API, SSE event format, and database schema are identical to `backend/` — only the agent orchestration layer differs.

### Graph topology

Both agents share the same graph shape, compiled once at startup and registered via `fastify.decorate`:

```
START → [reason] → shouldContinue → [act] → [reason] → …
                          │
                          ▼
                         END
```

| Node | Role |
|------|------|
| `reason` | Calls LLM with full message history; returns AIMessage (with optional tool_calls) |
| `act` | LangGraph built-in `ToolNode` — executes tool_calls, appends ToolMessage results |
| `shouldContinue` | Routes to `act` when tool_calls non-empty, otherwise to END |

### Request flow

```
POST /api/chat
  │
  ├─ userService.findOrCreateUser(sessionId)       → internalUserId (UUID)
  ├─ Promise.all([memories, history, ragContext, prefs])
  │
  ├─ graph.streamEvents({ userId: sessionId, ... })
  │     ├─ on_chat_model_stream → SSE { type: 'text' }
  │     ├─ on_tool_start        → SSE { type: 'tool_start' }
  │     └─ on_tool_end          → SSE { type: 'tool_end' }
  │
  └─ Promise.allSettled([saveAssistantMessage, extractMemories])
```

> **userId identity:** `session_id` (TEXT from browser localStorage) is used as the key for all tool repositories (`google_tokens`, `icloud_tokens`, `user_service_preferences`). `internalUserId` (UUID) is used only for conversations, messages, and user_memories tables.

### Key differences vs `backend/`

| Aspect | `backend/` | `backend-langgraph/` |
|--------|-----------|----------------------|
| ReAct loop | Manual `for` loop, `MAX_ITERATIONS` | LangGraph graph + conditional edge |
| State management | Local `messages[]` array | `AgentState` with typed reducers |
| Tool execution | `handleToolCall` + `Promise.all` | Built-in `ToolNode` |
| Streaming | `yield` at each event | `graph.streamEvents()` automatically |
| LLM abstraction | Custom `LLMClient` interface | LangChain `BaseChatModel` |

---

## Google Calendar & Tasks

Users connect their Google account from `/settings`. The OAuth2 flow requests both `calendar` and `tasks` scopes.

### Calendar

Events are written to dedicated calendars created automatically on first use:
- **"Travel Agent"** — for travel planning events
- **"Shopping"** — for shopping-related events

`manage_calendar` tool actions: `add`, `list`, `update`, `delete`.

### Tasks

Tasks are written to a named Google Tasks list (default: **"Travel Plans"** for travel, **"Shopping"** for shopping). The list name is configurable in `/settings`.

`manage_tasks` tool actions: `add`, `list`, `complete`, `delete`, `update`.

> **Due date enforcement:** The agent always asks the user for an explicit due date — it never infers or guesses one.

### OAuth2 flow

```
GET /auth/google/start?userId=<sessionId>  → Google consent screen
GET /auth/google/callback?code=&state=     → saves tokens → /settings?google_auth=success
GET /auth/google/status?userId=            → { connected: boolean }
DELETE /auth/google/disconnect?userId=     → revoke tokens
```

Required env vars:
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3002/auth/google/callback
```

---

## Apple iCloud (CalDAV)

Users enter their Apple ID and an **app-specific password** (from [appleid.apple.com](https://appleid.apple.com)) in `/settings`. Credentials are validated via a CalDAV PROPFIND and stored AES-256-GCM encrypted.

Calendar events use VEVENT; reminders use VTODO. Users can select which Reminders list receives tasks from a dropdown populated by live CalDAV discovery.

Provider switching between Google and Apple is instant — the `UserAwareCalendarProvider` and `UserAwareTasksProvider` delegate based on the `calendarProvider` preference in `user_service_preferences`.

Required env var:
```env
ENCRYPTION_KEY=<32-character-secret>
```

---

## Telegram Bot

A standalone `backend-telegram` workspace package bridges Telegram to the LangGraph backend via SSE.

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + feature overview |
| `/new` | Start a new conversation |
| `/history` | List recent conversations |
| `/tasks` | Show tomorrow's tasks |
| `/remind` | Subscribe to daily calendar digest |
| `/travel`, `/shopping` | Switch agent type |

### Media support

- **Photos** — downloaded, converted to base64, sent as multimodal content
- **Voice messages** — OGG decoded to PCM, transcribed via OpenAI Whisper, sent as text
- **Location** — reverse-geocoded to a place name, prepended to the message ("I'm in Paris — ...")

### Calendar cron

A `node-cron` job runs daily at 08:00 and sends each subscribed user a digest of tomorrow's calendar events and tasks via Telegram.

Required env vars:
```env
TELEGRAM_BOT_TOKEN=...
```

---

## Web Push Notifications

Browser push notifications (VAPID) deliver a daily morning digest of tomorrow's events and tasks to users who haven't installed the Telegram bot.

### Flow

1. User clicks **"Enable Notifications"** in `/settings`
2. Browser requests `Notification` permission
3. Service worker (`/sw.js`) registers and subscribes via `PushManager`
4. Subscription (endpoint + p256dh + auth) sent to `POST /api/push/subscribe`
5. Server stores subscription in `push_subscriptions` table

### Daily cron (backend-langgraph)

`node-cron` job runs at 08:00 daily:
1. Queries all `push_subscriptions JOIN users`
2. For each subscriber: calls `calendarProvider.list()` + `tasksProvider.list()`
3. Sends notification via `web-push` library
4. On HTTP 410 (expired): removes subscription from DB

Required env vars:
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:your@email.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...   # frontend/.env.local
```

Generate keys: `npx web-push generate-vapid-keys`

---

## Multimodal Input (Images & PDFs)

Users can attach files to any message via the paperclip button.

| Type | Anthropic | OpenAI |
|------|-----------|--------|
| Images | Native vision | Native vision |
| PDF | Native document block (pdfs-2024-09-25 beta) | Server-side text extraction via `pdf-parse` |

Files are sent as base64 in the request body — no server-side storage.

---

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Node.js 22+
- npm 10+
- API keys: [Anthropic](https://console.anthropic.com/), [Tavily](https://tavily.com/), [OpenWeatherMap](https://openweathermap.org/api)

### 1. Clone & configure

```bash
git clone <repo-url>
cd <repo-dir>
cp .env.example .env
# Fill in API keys
```

### 2. Start the database

```bash
docker compose up -d
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations

```bash
npm run migrate --workspace=backend-langgraph
```

### 5. Seed the knowledge base

```bash
npm run seed --workspace=backend-langgraph
```

### 6. Start the app

```bash
# Three separate terminals:
npm run dev:backend-langgraph   # :3002 (primary)
npm run dev:frontend            # :3000
npm run dev:backend-telegram    # :3003 (optional — Telegram bot)
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Tests | Test DB — must be a separate database on port 5432 |
| `ANTHROPIC_API_KEY` | When `LLM_PROVIDER=anthropic` | Claude API key |
| `OPENAI_API_KEY` | When `LLM_PROVIDER=openai` | OpenAI API key |
| `LLM_PROVIDER` | No | `anthropic` (default) or `openai` |
| `TAVILY_API_KEY` | Yes | Web search |
| `OPENWEATHER_API_KEY` | Yes | Weather tool |
| `VOYAGE_API_KEY` | No | Semantic embeddings (random vectors used in dev if absent) |
| `GOOGLE_CLIENT_ID` | Google Calendar | OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google Calendar | OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | Google Calendar | `http://localhost:3002/auth/google/callback` |
| `ENCRYPTION_KEY` | iCloud | 32-char key for AES-256-GCM credential encryption |
| `VAPID_PUBLIC_KEY` | Web Push | VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push | VAPID private key |
| `VAPID_EMAIL` | Web Push | `mailto:you@example.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot | Bot token from @BotFather |
| `ALLOWED_ORIGIN` | Production | CORS origin |
| `PORT` | No | Backend port (default `3002`) |

> Frontend also needs `frontend/.env.local` with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

---

## Running Tests

```bash
# TypeScript check (both backends)
npx tsc -p backend/tsconfig.json --noEmit && npx tsc -p backend-langgraph/tsconfig.json --noEmit

# Unit tests (no DB required)
npm run test --workspace=backend-langgraph

# All tests including integration (requires test DB)
docker exec travel-agent-postgres-1 psql -U user -d postgres -c "CREATE DATABASE travel_agent_test;" 2>/dev/null || true
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/travel_agent_test" \
  npm run test:all --workspace=backend-langgraph
```

### Test coverage (backend-langgraph)

| Suite | Type | Tests |
|-------|------|-------|
| `wrapTool` | unit | 8 |
| `CalendarTool`, `TasksTool` | unit | 16 |
| `WeatherTool`, `WebSearchTool` | unit | 12 |
| `MemoryService`, `RAGService`, `UserService` | unit | 18 |
| `travelGraph`, `shoppingGraph`, `reasonNode`, `shouldContinue` | unit | 28 |
| `chat.p0`, `history` | unit | 25 |
| `chat` (integration) | integration | 11 |
| `conversations` (integration) | integration | 5 |
| `memory` (integration) | integration | 6 |
| `conversationRepository` (integration) | integration | 7 |
| **Total** | | **156** |

---

## API Reference

### `POST /api/chat`

Start or continue a conversation. Returns a **Server-Sent Events** stream.

**Request body:**
```json
{
  "userId": "session-uuid",
  "message": "Plan a 5-day trip to Kyoto",
  "conversationId": "optional-uuid",
  "agentType": "travel",
  "platform": "web",
  "attachments": [{ "name": "ticket.pdf", "mimeType": "application/pdf", "base64": "..." }]
}
```

**SSE events:**
```
data: {"type":"conversation_id","conversationId":"uuid"}
data: {"type":"tool_start","tool":"web_search","input":{...}}
data: {"type":"tool_end","tool":"web_search","output":{...}}
data: {"type":"text","content":"Here is your itinerary..."}
data: {"type":"sources","sources":[{"title":"...","url":"..."}]}
data: {"type":"suggestions","suggestions":["..."]}
data: {"type":"done"}
```

---

### `GET /api/settings?userId=`
### `POST /api/settings?userId=`

Get or update user preferences: `calendarProvider`, `calendarName`, `taskListName`, `shoppingTaskListName`, etc.

---

### `GET /auth/google/status?userId=`
### `GET /auth/google/start?userId=`
### `DELETE /auth/google/disconnect?userId=`

Google OAuth2 flow. Callback: `GET /auth/google/callback?code=&state=`

---

### `POST /auth/apple/connect?userId=`

Save and validate iCloud credentials (`appleId`, `appPassword`).

---

### `GET /api/calendar?userId=&agentType=`

Returns upcoming events and tasks from the user's connected provider (Google or Apple).

---

### `POST /api/push/subscribe`
### `DELETE /api/push/unsubscribe`
### `GET /api/push/vapid-public-key`

Web Push subscription management.

---

### `GET /api/memory/:userId`
### `DELETE /api/memory/:userId/:key`

User preference storage. Scoped to `agentType` query param.

---

### `GET /api/conversations/:userId`
### `GET /api/conversations/:userId/:conversationId/messages`
### `DELETE /api/conversations/:userId/:conversationId`

Conversation history management.

---

## How the ReAct Loop Works

```
User message + agentType
     │
     ▼
┌────────────────────────────────────────┐
│  1. Build messages (history + RAG)     │
│  2. Call LLM with tool definitions     │
│                                        │
│  ┌─ LLM response ─────────────────┐   │
│  │  has tool_calls ?              │   │
│  └────────────────────────────────┘   │
│       │ Yes              │ No          │
│       ▼                  ▼            │
│  Execute tools      Emit final text   │
│  Append results     Break loop        │
│  Loop continues                       │
└────────────────────────────────────────┘
     │
     ▼
SSE { type: "done" }
```

---

## Long-Term Memory

After each turn, `MemoryService.extractAndSaveMemories()` sends the exchange to Claude Haiku:

- **Travel:** extracts `home_city`, `preferred_airlines`, `dietary_restrictions`, `travel_budget`, `travel_style`, `passport_country`, `hotel_type`
- **Shopping:** extracts `preferred_brands`, `budget_range`, `favorite_stores`, `size_preferences`, `product_categories`

Preferences are upserted into `user_memories` and injected into the system prompt on the next request. Users can view and delete preferences from the Preferences panel in the UI.

---

## Agentic RAG

Before the agent runs, `RAGService` runs a two-step pipeline:

1. **Gate** — Claude Haiku decides if retrieval is needed (skips for conversational messages)
2. **Search** — `EmbeddingService.embed(query)` → pgvector cosine similarity → top-3 chunks prepended to the message

The knowledge base contains visa requirements, health tips, currency/tipping guides, and cultural etiquette for popular travel destinations. Voyage AI `voyage-3-lite` (512 dims) is used for embeddings; random unit vectors are used as a fallback in dev.

---

## Replacing the LLM Provider

Set in `.env`:
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-…
```

The `createModel` factory in `backend-langgraph` selects Claude Haiku/Sonnet or GPT-4o-mini/GPT-4o based on the `tier` argument. All tools, services, and the frontend are provider-agnostic.
