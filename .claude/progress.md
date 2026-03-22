# Travel Planning AI Agent — Progress Tracker

> **Prompt to start any new session:**
> ```
> Read /home/alexey/Jobs/exams/navan-cognition-AI-assignment/.claude/progress.md
> and execute the next task with status ⬜ TODO.
> After completion, update its status to ✅ DONE.
> ```

> **Global rules:**
> - All code, comments, JSDoc, README, and documentation must be in **English**
> - Conversation with the user is in Russian

---

## Task Status

| # | Task | Status |
|---|------|--------|
| 1 | Docker + DB setup | ✅ DONE |
| 2 | Backend: Tools (BaseTool, WebSearchTool, WeatherTool) | ✅ DONE |
| 3 | Backend: Agent core (TravelAgent, ReAct loop) | ⬜ TODO |
| 4 | Backend: Services (MemoryService, RAGService, EmbeddingService) | ⬜ TODO |
| 5 | Backend: Repositories + Routes (chat SSE, memory) | ⬜ TODO |
| 6 | Unit tests | ⬜ TODO |
| 7 | Integration tests | ⬜ TODO |
| 8 | Frontend (Next.js chat UI + AgentThoughts + MemoryPanel) | ⬜ TODO |
| 9 | README + Knowledge base seed | ⬜ TODO |

---

## Architecture Overview

```
travel-agent/
├── docker-compose.yml
├── .env.example
├── package.json                    # npm workspaces root
├── tsconfig.base.json
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── config/env.ts           # Zod env validation
│   │   ├── db/client.ts            # pg Pool singleton
│   │   ├── db/migrations/
│   │   │   ├── 001_schema.sql
│   │   │   └── 002_pgvector.sql
│   │   ├── tools/
│   │   │   ├── BaseTool.ts         # abstract class
│   │   │   ├── WebSearchTool.ts    # Tavily API
│   │   │   ├── WeatherTool.ts      # OpenWeatherMap API
│   │   │   └── ToolRegistry.ts
│   │   ├── agent/
│   │   │   ├── TravelAgent.ts      # ReAct loop (AsyncGenerator + SSE)
│   │   │   ├── AgentContext.ts     # immutable per-request state
│   │   │   └── prompts.ts          # system prompt templates
│   │   ├── services/
│   │   │   ├── ConversationService.ts
│   │   │   ├── MemoryService.ts
│   │   │   ├── RAGService.ts
│   │   │   └── EmbeddingService.ts
│   │   ├── repositories/
│   │   │   ├── BaseRepository.ts
│   │   │   ├── ConversationRepository.ts
│   │   │   ├── MemoryRepository.ts
│   │   │   └── KnowledgeRepository.ts
│   │   ├── routes/
│   │   │   ├── chat.ts             # POST /api/chat (SSE)
│   │   │   └── memory.ts           # GET/DELETE /api/memory/:userId
│   │   └── types/
│   │       ├── agent.ts
│   │       ├── tools.ts
│   │       └── memory.ts
│   └── tests/
│       ├── unit/
│       └── integration/
└── frontend/
    └── src/
        ├── app/page.tsx
        └── components/
            ├── ChatWindow.tsx
            ├── MessageBubble.tsx
            ├── AgentThoughts.tsx
            └── MemoryPanel.tsx
```

**Tech Stack:** Node.js + TypeScript + Fastify + PostgreSQL + pgvector | Next.js 14 + Tailwind + shadcn/ui | Claude API (claude-sonnet-4-6) | Tavily Search + OpenWeatherMap | Jest

---

## TASK 1 — Docker + DB setup

**Status:** ✅ DONE

**Files to create:**
- `docker-compose.yml` — PostgreSQL 16 + pgvector
- `package.json` (root workspaces)
- `tsconfig.base.json`
- `backend/package.json` + `backend/tsconfig.json` + `backend/jest.config.ts`
- `backend/src/config/env.ts` — Zod-validated env
- `backend/src/db/client.ts` — pg Pool singleton
- `backend/src/db/migrations/001_schema.sql`
- `backend/src/db/migrations/002_pgvector.sql`
- `backend/src/db/migrate.ts` — migration runner
- `.env.example`

**Implementation details:**

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: travel_agent
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  postgres_test:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: travel_agent_test
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports: ["5433:5432"]
```

```sql
-- 001_schema.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  agent_steps JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- 002_pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX knowledge_embedding_idx ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Backend dependencies:**
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.0",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "pg": "^8.13.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/pg": "^8.11.0",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.19.0"
  }
}
```

---

## TASK 2 — Backend: Tools

**Status:** ✅ DONE
**Depends on:** Task 1 ✅ DONE

**Files to create:**
- `backend/src/types/tools.ts`
- `backend/src/types/agent.ts`
- `backend/src/tools/BaseTool.ts`
- `backend/src/tools/WebSearchTool.ts`
- `backend/src/tools/WeatherTool.ts`
- `backend/src/tools/ToolRegistry.ts`

**Implementation details:**

```typescript
// types/tools.ts
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
}

// tools/BaseTool.ts
import Anthropic from '@anthropic-ai/sdk';
import { ToolResult, JSONSchema } from '../types/tools';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchema;

  abstract execute(input: unknown): Promise<ToolResult>;

  toAnthropicTool(): Anthropic.Tool {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.inputSchema as Anthropic.Tool['input_schema'],
    };
  }
}

// tools/WebSearchTool.ts — Tavily API
// input: { query: string, max_results?: number }
// Tavily endpoint: POST https://api.tavily.com/search
// On error returns { success: false, error: message }

// tools/WeatherTool.ts — OpenWeatherMap API
// input: { city: string, days?: number }
// Endpoint: GET https://api.openweathermap.org/data/2.5/forecast
// Parses: temp, description, humidity per day

// tools/ToolRegistry.ts
// Map<name, BaseTool> + register() + get() + getAll() + execute()
```

---

## TASK 3 — Backend: Agent Core (ReAct loop)

**Status:** ⬜ TODO
**Depends on:** Tasks 1, 2 ✅ DONE

**Files to create:**
- `backend/src/types/memory.ts`
- `backend/src/agent/AgentContext.ts`
- `backend/src/agent/prompts.ts`
- `backend/src/agent/TravelAgent.ts`

**Implementation details:**

```typescript
// types/memory.ts
export interface UserMemory { key: string; value: string; }
export interface KnowledgeChunk { topic: string; content: string; similarity: number; }

// agent/AgentContext.ts — immutable value object
export class AgentContext {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly userMessage: string,
    public readonly memories: UserMemory[],
    public readonly ragContext: string | null,
    public readonly history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {}
}

// agent/prompts.ts
// buildSystemPrompt(memories: UserMemory[]): string
// Includes: agent role, ReAct instructions, user memories,
//           self-correction instructions on tool errors

// agent/TravelAgent.ts
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; error?: string }
  | { type: 'done' };

export class TravelAgent {
  constructor(
    private toolRegistry: ToolRegistry,
    private anthropic: Anthropic,
  ) {}

  async *run(context: AgentContext): AsyncGenerator<AgentEvent> {
    // 1. Build messages array from history + userMessage
    // 2. Build tools array from toolRegistry.getAll()
    // 3. ReAct loop (max 10 iterations):
    //    a. call claude
    //    b. if stop_reason === 'tool_use': handleToolCall → emit events → append result
    //    c. if stop_reason === 'end_turn': emit final text → break
    // 4. emit { type: 'done' }
  }

  private async handleToolCall(
    toolUse: Anthropic.ToolUseBlock,
  ): Promise<{ result: Anthropic.ToolResultBlockParam; output: unknown; error?: string }> {
    // try { execute } catch { return is_error: true }
    // Self-correction: error is fed back to Claude who decides next step
  }
}
```

**SSE event format:**
```
data: {"type":"text","content":"Let me check..."}
data: {"type":"tool_start","tool":"web_search","input":{"query":"Tokyo visa"}}
data: {"type":"tool_end","tool":"web_search","output":{...}}
data: {"type":"done"}
```

---

## TASK 4 — Backend: Services

**Status:** ⬜ TODO
**Depends on:** Tasks 1–3 ✅ DONE

**Files to create:**
- `backend/src/repositories/BaseRepository.ts`
- `backend/src/repositories/ConversationRepository.ts`
- `backend/src/repositories/MemoryRepository.ts`
- `backend/src/repositories/KnowledgeRepository.ts`
- `backend/src/services/EmbeddingService.ts`
- `backend/src/services/ConversationService.ts`
- `backend/src/services/MemoryService.ts`
- `backend/src/services/RAGService.ts`

**Implementation details:**

```typescript
// repositories/BaseRepository.ts
export abstract class BaseRepository {
  constructor(protected pool: Pool) {}
  protected async query<T>(sql: string, params?: unknown[]): Promise<T[]>
}

// repositories/MemoryRepository.ts
// upsertMemory(userId, key, value): Promise<void>  — INSERT ... ON CONFLICT DO UPDATE
// getMemories(userId): Promise<UserMemory[]>
// deleteMemory(userId, key): Promise<void>

// repositories/KnowledgeRepository.ts
// findSimilar(embedding: number[], topK: number): Promise<KnowledgeChunk[]>
//   SELECT content, topic, 1 - (embedding <=> $1) AS similarity
//   FROM knowledge_base ORDER BY embedding <=> $1 LIMIT $2
// insert(topic, content, embedding, metadata): Promise<void>

// services/EmbeddingService.ts
// embed(text: string): Promise<number[]>
// Uses Anthropic or voyage-3-lite API for embeddings
// Fallback: if no API key → returns random vector (dev mode)

// services/MemoryService.ts
// getMemories(userId): Promise<UserMemory[]>
// extractAndSaveMemories(userId, conversationText): Promise<void>
//   → Calls Claude: "Extract user preferences from this conversation as JSON"
//   → Saves via MemoryRepository.upsertMemory()

// services/RAGService.ts
// shouldQueryKnowledgeBase(query: string): Promise<boolean>
//   → Claude: "Does this query need destination knowledge? Answer only: yes/no"
// retrieve(query, topK=3): Promise<KnowledgeChunk[]>
//   → embed(query) → KnowledgeRepository.findSimilar()
// ingestDocument(topic, content): Promise<void>
//   → embed(content) → KnowledgeRepository.insert()
```

---

## TASK 5 — Backend: Routes + index.ts

**Status:** ⬜ TODO
**Depends on:** Tasks 1–4 ✅ DONE

**Files to create:**
- `backend/src/routes/chat.ts` — POST /api/chat (SSE)
- `backend/src/routes/memory.ts` — GET/DELETE /api/memory/:userId
- `backend/src/index.ts` — Fastify bootstrap
- `backend/src/db/migrate.ts` — migration runner

**Implementation details:**

```typescript
// routes/chat.ts
// POST /api/chat
// Body: { userId: string, message: string, conversationId?: string }
// Response: SSE stream (text/event-stream)
// Algorithm:
//   1. Find/create user and conversation in DB
//   2. Load memories
//   3. Check RAG
//   4. Build AgentContext
//   5. reply.raw.setHeader('Content-Type', 'text/event-stream')
//   6. for await (event of agent.run(context)) → reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
//   7. Save messages to DB
//   8. extractAndSaveMemories()

// routes/memory.ts
// GET  /api/memory/:userId → { memories: UserMemory[] }
// DELETE /api/memory/:userId/:key → 204

// index.ts
// Fastify + @fastify/cors + register routes + listen on PORT
```

---

## TASK 6 — Unit Tests

**Status:** ⬜ TODO
**Depends on:** Tasks 1–5 ✅ DONE

**Files to create:**
- `backend/tests/unit/tools/WebSearchTool.test.ts`
- `backend/tests/unit/tools/WeatherTool.test.ts`
- `backend/tests/unit/agent/TravelAgent.test.ts`
- `backend/tests/unit/services/MemoryService.test.ts`
- `backend/tests/unit/services/RAGService.test.ts`

**Details:**
- All external dependencies (Anthropic, Tavily, OpenWeatherMap, pg) mocked via `jest.mock()`
- `WebSearchTool.test.ts`: successful search, API error (non-200), network error
- `WeatherTool.test.ts`: forecast response parsing, city not found (404)
- `TravelAgent.test.ts`: single cycle without tool use, single cycle with tool use, self-correction on tool error
- `MemoryService.test.ts`: extract and save memories, empty conversation
- `RAGService.test.ts`: shouldQueryKnowledgeBase (yes/no), retrieve with results

**After completion:** run `cd backend && npm test -- --testPathPattern=unit` and verify all tests pass.

---

## TASK 7 — Integration Tests

**Status:** ⬜ TODO
**Depends on:** Task 6 ✅ DONE

**Files to create:**
- `backend/tests/integration/chat.test.ts`
- `backend/tests/integration/memory.test.ts`
- `backend/tests/helpers/testDb.ts` — setup/teardown test DB

**Details:**
- Uses real test DB (postgres_test on port 5433)
- LLM is mocked (no API credits spent)
- `chat.test.ts`: POST /api/chat creates messages in DB, returns SSE, saves memories
- `memory.test.ts`: GET returns memories, DELETE removes them

**Before running:** ensure `docker compose up -d` is running.
**After completion:** run `cd backend && npm test -- --testPathPattern=integration`.

---

## TASK 8 — Frontend (Next.js)

**Status:** ⬜ TODO
**Depends on:** Task 5 ✅ DONE

**Files to create:**
- `frontend/` — new Next.js 14 project (app router)
- `frontend/src/app/page.tsx`
- `frontend/src/components/ChatWindow.tsx`
- `frontend/src/components/MessageBubble.tsx`
- `frontend/src/components/AgentThoughts.tsx` — collapsible tool calls
- `frontend/src/components/MemoryPanel.tsx`
- `frontend/src/lib/api.ts` — SSE client

**UI layout:**
```
┌────────────────────────────────────────────────────────┐
│  ✈  Travel Planning Agent           [Your Preferences] │
├──────────────────────────────────┬─────────────────────┤
│                                  │ Home: SF            │
│  [user bubble]                   │ Airline: United     │
│  Plan a trip to Tokyo in April   │ Diet: vegetarian    │
│                                  │ Budget: mid         │
│  [assistant bubble]              └─────────────────────┘
│  ▼ Agent is thinking...
│    web_search: "Tokyo April..."
│       ✓ 5 results
│    get_weather: "Tokyo"
│       ✓ 22°C, partly cloudy
│
│  Here's your personalized Tokyo plan...
│
├────────────────────────────────────────────────────────┤
│  [input field]                          [Send]          │
└────────────────────────────────────────────────────────┘
```

**Technical details:**
- SSE via `fetch` + `ReadableStream` (not `EventSource` — requires POST)
- `userId` stored in `localStorage` (generated on first visit)
- Tailwind + shadcn/ui components (Button, Card, ScrollArea, Badge)
- AgentThoughts: collapsible section showing tool calls in real time

**Bootstrap command** (if `frontend/` does not exist):
```
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

---

## TASK 9 — README + Knowledge base seed

**Status:** ⬜ TODO
**Depends on:** Tasks 1–8 ✅ DONE

**Files to create:**
- `README.md` — architecture, setup, usage
- `backend/src/db/seed.ts` — seed knowledge_base with travel documents (visa tips, travel health, cultural guides for 5–7 popular destinations)

**README must include:**
1. Project overview + demo screenshot placeholder
2. Architecture diagram (ASCII)
3. Quick start (docker compose up, migrate, seed, npm run dev)
4. Environment variables table
5. How the ReAct loop works
6. Self-correction explanation
7. Long-term memory explanation
8. Agentic RAG explanation

---

## Environment Variables (.env.example)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/travel_agent
TEST_DATABASE_URL=postgresql://user:password@localhost:5433/travel_agent_test

# AI
ANTHROPIC_API_KEY=sk-ant-...

# External Tools
TAVILY_API_KEY=tvly-...
OPENWEATHER_API_KEY=...

# Server
PORT=3001
NODE_ENV=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

*Last updated: 2026-03-22*
