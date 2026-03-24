# Travel Planning AI Agent

A full-stack AI travel planning assistant powered by Claude. The agent uses a **ReAct loop** (Reason → Act → Observe → Respond) to answer travel queries, remembers user preferences across sessions, and retrieves curated destination knowledge via **Agentic RAG**.

```
┌────────────────────────────────────────────────────────┐
│  ✈  Travel Planning Agent           [Your Preferences] │
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

## Architecture

```
travel-agent/
├── docker-compose.yml           # PostgreSQL 16 + pgvector (dev + test)
├── .env.example
├── package.json                 # npm workspaces root
├── tsconfig.base.json
├── backend/
│   └── src/
│       ├── index.ts             # Fastify server bootstrap
│       ├── config/env.ts        # Zod-validated environment
│       ├── db/
│       │   ├── client.ts        # pg Pool singleton
│       │   ├── migrate.ts       # SQL migration runner
│       │   ├── seed.ts          # Knowledge base seed data
│       │   └── migrations/
│       │       ├── 001_schema.sql   # users, conversations, messages, user_memories
│       │       └── 002_pgvector.sql # knowledge_base + IVFFlat index
│       ├── tools/
│       │   ├── BaseTool.ts         # Abstract base class → Anthropic Tool shape
│       │   ├── WebSearchTool.ts    # Tavily web search
│       │   ├── WeatherTool.ts      # OpenWeatherMap forecast
│       │   ├── CountryInfoTool.ts  # RestCountries API (free, no key)
│       │   ├── CurrencyTool.ts     # Frankfurter API (free, no key)
│       │   ├── FlightSearchTool.ts # Deterministic flight mock (demo data)
│       │   └── ToolRegistry.ts     # Tool map + execute dispatcher
│       ├── agent/
│       │   ├── TravelAgent.ts   # ReAct loop (AsyncGenerator + SSE events)
│       │   ├── AgentContext.ts  # Immutable per-request value object
│       │   └── prompts.ts       # System prompt builder
│       ├── services/
│       │   ├── ConversationService.ts
│       │   ├── MemoryService.ts      # Preference extraction + persistence
│       │   ├── SuggestionService.ts  # Follow-up question generation (Haiku)
│       │   ├── RAGService.ts         # Agentic retrieval-augmented generation
│       │   └── EmbeddingService.ts   # voyage-3-lite 512-dim; random fallback in dev
│       ├── repositories/
│       │   ├── BaseRepository.ts
│       │   ├── ConversationRepository.ts
│       │   ├── MemoryRepository.ts
│       │   └── KnowledgeRepository.ts  # pgvector cosine similarity search
│       ├── routes/
│       │   ├── chat.ts          # POST /api/chat → SSE stream
│       │   └── memory.ts        # GET/DELETE /api/memory/:userId
│       └── types/
│           ├── agent.ts
│           ├── tools.ts
│           └── memory.ts
└── frontend/
    └── src/
        ├── app/page.tsx
        └── components/
            ├── ChatWindow.tsx
            ├── MessageBubble.tsx
            ├── AgentThoughts.tsx  # Collapsible real-time tool calls
            └── MemoryPanel.tsx    # Displayed + deletable preferences
```

### Component diagram

```
Browser (Next.js)
    │  POST /api/chat  (SSE stream)
    │  GET/DELETE /api/memory/:userId
    ▼
Fastify (Node.js)
    ├── ChatRoute
    │     ├── ConversationService  ──► PostgreSQL
    │     ├── MemoryService        ──► PostgreSQL (user_memories)
    │     ├── RAGService           ──► EmbeddingService ──► Voyage AI API
    │     │                        ──► KnowledgeRepository ──► pgvector
    │     └── TravelAgent (ReAct loop)
    │           ├── Claude claude-sonnet-4-6  (reasoning + tool calls)
    │           ├── WebSearchTool    ──► Tavily API
    │           ├── WeatherTool      ──► OpenWeatherMap API
    │           ├── CountryInfoTool  ──► RestCountries API (free, no key)
    │           └── CurrencyTool     ──► Frankfurter API (free, no key)
    └── MemoryRoute ──► MemoryRepository ──► PostgreSQL
```

**Tech stack:** Node.js 22 · TypeScript 5 · Fastify 5 · PostgreSQL 16 + pgvector · Next.js 14 · Tailwind CSS · shadcn/ui · Claude `claude-sonnet-4-6` · Tavily Search · OpenWeatherMap · RestCountries · Frankfurter · Jest

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
cd travel-agent
cp .env.example .env
# Edit .env — fill in your API keys
```

### 2. Start the database

```bash
docker compose up -d
```

This starts two PostgreSQL containers:
- `postgres` on port **5432** — development database
- `postgres_test` on port **5433** — test database (isolated)

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations

```bash
npm run migrate --workspace=backend
```

Creates the schema (`users`, `conversations`, `messages`, `user_memories`) and installs the pgvector extension + `knowledge_base` table.

### 5. Seed the knowledge base

```bash
npm run seed --workspace=backend
```

Embeds and stores curated travel documents (visa requirements, health tips, cultural guides) for 7 popular destinations into the `knowledge_base` table.

### 6. Start the app

```bash
# Backend (port 3001) + Frontend (port 3000) — run in separate terminals
npm run dev:backend
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (dev) |
| `TEST_DATABASE_URL` | For tests | PostgreSQL connection string (test) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key (`sk-ant-…`) |
| `TAVILY_API_KEY` | Yes | Tavily web search API key (`tvly-…`) |
| `OPENWEATHER_API_KEY` | Yes | OpenWeatherMap API key |
| `VOYAGE_API_KEY` | No | Voyage AI key for semantic embeddings (random vectors used in dev if absent) |

> **RestCountries** and **Frankfurter** are fully free public APIs — no key or registration required.
| `PORT` | No | Backend port (default `3001`) |
| `NODE_ENV` | No | `development` / `production` / `test` |
| `NEXT_PUBLIC_API_URL` | Yes (frontend) | Backend URL seen by the browser |

---

## How the ReAct Loop Works

The `TravelAgent` implements the **ReAct** pattern (Reasoning + Acting) as an async generator that emits SSE events to the client in real time.

```
User message
     │
     ▼
┌────────────────────────────────────────┐
│  1. Build messages array               │
│     (history + RAG context + message)  │
│  2. Call Claude with tool definitions  │
│                                        │
│  ┌─ Claude response ──────────────┐   │
│  │  stop_reason = "tool_use"  ?   │   │
│  └────────────────────────────────┘   │
│       │ Yes                │ No        │
│       ▼                    ▼           │
│  Execute tool(s)      Emit final text  │
│  Append result        Break loop       │
│  Loop (max 10)                         │
└────────────────────────────────────────┘
     │
     ▼
emit { type: "done" }
```

**SSE event stream example:**

```
data: {"type":"conversation_id","conversationId":"uuid"}
data: {"type":"text","content":"Let me check the latest visa requirements…"}
data: {"type":"tool_start","tool":"web_search","input":{"query":"Japan visa US citizens 2025"}}
data: {"type":"tool_end","tool":"web_search","output":{"results":[…]}}
data: {"type":"tool_start","tool":"get_weather","input":{"city":"Tokyo","days":5}}
data: {"type":"tool_end","tool":"get_weather","output":{"forecast":[…]}}
data: {"type":"text","content":"Here is your personalised Tokyo itinerary…"}
data: {"type":"sources","sources":[{"title":"Japan Visa Guide","url":"https://…"}]}
data: {"type":"suggestions","suggestions":["What's the best time to visit Kyoto?","How much does a week in Tokyo cost?","Do I need travel insurance for Japan?"]}
data: {"type":"done"}
```

---

## Self-Correction

When a tool call fails (network error, bad API key, malformed response), the error is **fed back to Claude as a `tool_result` with `is_error: true`**:

```typescript
{ type: 'tool_result', tool_use_id: id, content: `Error: ${message}`, is_error: true }
```

Claude then sees the failure in its context and can:
- Retry with different parameters (e.g. a simpler search query)
- Switch to an alternative tool
- Inform the user and proceed without that data

This loop continues for up to 10 iterations, so transient failures are handled gracefully without any external retry logic.

---

## Long-Term Memory

After each conversation turn, `MemoryService.extractAndSaveMemories()` sends the full exchange to **Claude Haiku** with the prompt:

> *"Extract user travel preferences from this conversation as a flat JSON object."*

Extracted key-value pairs (e.g. `{ "home_city": "San Francisco", "diet": "vegetarian" }`) are **upserted** into the `user_memories` table using `INSERT … ON CONFLICT DO UPDATE`.

On the next request these preferences are injected into the system prompt so Claude personalises every response — recommending vegetarian restaurants, routing through the user's home airport, staying within budget, etc.

Users can view and delete individual preferences from the **Preferences panel** in the UI, which calls `DELETE /api/memory/:userId/:key`.

---

## Agentic RAG

Before invoking the agent, the chat route runs a **two-step retrieval pipeline**:

### Step 1 — Should we query the knowledge base?

`RAGService.shouldQueryKnowledgeBase(query)` calls Claude Haiku with the user's message and asks for a `yes/no` answer. If the query is conversational ("thanks!", "what did you just say?") retrieval is skipped entirely.

### Step 2 — Semantic search

If retrieval is warranted:
1. `EmbeddingService.embed(query)` converts the query to a 512-dimension vector via Voyage AI (`voyage-3-lite`). In development without a `VOYAGE_API_KEY`, random unit vectors are used as a fallback.
2. `KnowledgeRepository.findSimilar()` runs a **cosine similarity** search against the `knowledge_base` table using pgvector:
   ```sql
   SELECT topic, content, 1 - (embedding <=> $1) AS similarity
   FROM knowledge_base
   ORDER BY embedding <=> $1
   LIMIT $2;
   ```
3. The top-3 chunks are prepended to the user message as inline context before Claude is called.

The seeded knowledge base contains curated documents on visa requirements, health tips, currency/tipping guides, and cultural etiquette for 7 popular destinations. This gives the agent authoritative baseline knowledge even when web search is rate-limited.

---

## Replacing the LLM Provider

The codebase uses a **provider-agnostic `LLMClient` interface** backed by a Factory pattern. Switching providers requires no changes to business logic — only a new implementation class needs to be written.

```
src/llm/
├── LLMClient.ts          # interface: stream() + complete()
├── types.ts              # shared types: LLMMessage, LLMToolCall, LLMStreamEvent, …
├── LLMClientFactory.ts   # Factory — reads LLM_PROVIDER from env
├── AnthropicLLMClient.ts # production implementation
└── OpenAILLMClient.ts    # stub — ready to implement
```

### Adding a new provider

1. Create `src/llm/<Provider>LLMClient.ts` implementing `LLMClient`
2. Add the provider name to the `LLMProvider` union in `LLMClientFactory.ts`
3. Add a `case` in `LLMClientFactory.create()`
4. Add the API key to `.env` and `src/config/env.ts`
5. Set `LLM_PROVIDER=<provider>` in the environment

Nothing else needs to change — `TravelAgent`, `MemoryService`, `RAGService`, `SuggestionService`, all tools, the database, the SSE infrastructure, and the frontend are all provider-agnostic.

### Key mapping from Anthropic to OpenAI

| Concept | Anthropic | OpenAI |
|---------|-----------|--------|
| Streaming | `messages.stream()` | `chat.completions.create({ stream: true })` |
| Tool schema | `input_schema` (JSON Schema) | `function.parameters` (JSON Schema) |
| Tool call in response | `content[]` block of type `tool_use` | `choices[0].message.tool_calls[]` |
| Tool result | `user` turn with `tool_result` content | `{ role: "tool", tool_call_id, content }` message |
| Simple completion | `messages.create()` | `chat.completions.create({ stream: false })` |

---

## Running Tests

```bash
# Unit tests (all external dependencies mocked)
npm run test:unit --workspace=backend

# Integration tests (requires Docker running)
docker compose up -d
npm run test:integration --workspace=backend

# All tests
npm test --workspace=backend
```

---

## API Reference

### `POST /api/chat`

Start or continue a conversation. Returns a **Server-Sent Events** stream.

**Request body:**
```json
{
  "userId": "session-uuid",
  "message": "Plan a 5-day trip to Kyoto in cherry blossom season",
  "conversationId": "optional-uuid-to-continue-a-conversation"
}
```

**Response:** `Content-Type: text/event-stream`

Each line is a JSON-encoded `AgentEvent` (see [SSE events](#how-the-react-loop-works) above).

---

### `GET /api/memory/:userId`

Returns all stored preferences for a user.

```json
{
  "memories": [
    { "key": "home_city", "value": "San Francisco" },
    { "key": "diet", "value": "vegetarian" }
  ]
}
```

---

### `DELETE /api/memory/:userId/:key`

Removes a single preference. Returns `204 No Content`.
