# LangGraph Workflow: from user request to response

The workflow is described in chronological order — from server startup to user response.

---

## 1. Bootstrap: application initialization

**File:** `backend-langgraph/src/index.ts`

On server startup, all dependencies are initialized once:

```
bootstrap()
  │
  ├── Fastify instance (cors, rate-limit, logger)
  │
  ├── Shared singletons:
  │     ├── pg Pool (DB)
  │     ├── EmbeddingService
  │     ├── UserService
  │     ├── ConversationService
  │     ├── MemoryService
  │     ├── RAGService
  │     ├── SuggestionService
  │     └── Google/Apple token repos + pref repo
  │
  ├── Calendar/Tasks providers:
  │     ├── GoogleCalendarProvider / MockCalendarProvider (if no OAuth)
  │     ├── GoogleTasksProvider / MockTasksProvider
  │     ├── ICloudCalendarProvider / ICloudRemindersProvider
  │     ├── UserAwareCalendarProvider (delegates to Google or Apple)
  │     └── UserAwareTasksProvider (delegates to Google or Apple)
  │
  ├── Compile agent graphs (once, reused across all requests):
  │     ├── initTravelGraph(calendarProvider, tasksProvider, conversationService)
  │     └── initShoppingGraph(ragService, calendarProvider, tasksProvider, conversationService)
  │
  ├── Register routes:
  │     ├── POST /api/chat     → chatRoutes
  │     ├── GET/POST /api/memory → memoryRoutes
  │     ├── GET/DELETE /api/conversations → conversationRoutes
  │     ├── GET/DELETE /auth/google/* → authRoutes (if OAuth configured)
  │     ├── GET/POST /api/settings → settingsRoutes
  │     ├── GET/DELETE /api/calendar* → calendarRoutes
  │     └── POST /api/export/pdf → exportRoutes
  │
  ├── Health check: GET /health → { status: 'ok', engine: 'langgraph' }
  │
  └── fastify.listen(PORT) → server ready
```

**Key code lines:**

```ts
// Lines 58-64: create shared singletons
const pool = getPool();
const embeddingService = new EmbeddingService();
const userService = new UserService(pool);
const conversationService = new ConversationService(pool, embeddingService);

// Lines 88-89: compile graphs (once!)
initTravelGraph(calendarProvider, tasksProvider, conversationService);
initShoppingGraph(ragService, calendarProvider, tasksProvider, conversationService);

// Line 92: register chatRoutes with injected dependencies
await fastify.register(chatRoutes, {
  userService, conversationService, memoryService, ragService, suggestionService, prefRepo,
});
```

---

## 2. User request: Frontend → POST /api/chat

**File:** `frontend/src/components/chat/ChatWindow.tsx`
**File:** `frontend/src/hooks/useStreamChat.ts`
**File:** `frontend/src/lib/api.ts`

The user types a message and presses Enter. ChatWindow collects text + attachments and sends a POST request via the `useStreamChat` hook.

```
ChatWindow.sendMessage()
  │  dispatch(ADD, user message)
  │  dispatch(ADD, assistant placeholder)
  ▼
api.ts POST /api/chat ──────────────────────► backend-langgraph (port 3002)
  │  body: { userId, message, conversationId, agentType, attachments }
  │  signal: AbortController (for cancellation)
  │
  ▼  (SSE response)
streamChat() reads ReadableStream
  │  parses "data: {...}" lines
  │  calls onEvent() for each event
  ▼
useStreamChat dispatch:
  │  "conversation_id" → setConversationId
  │  "text" → STREAM_TEXT (accumulates content)
  │  "tool_start" → TOOL_START (adds step to steps[])
  │  "tool_end" → TOOL_END (fills output/error)
  │  "sources" → SET_SOURCES
  │  "suggestions" → SET_SUGGESTIONS
  │  "done" → MARK_DONE (streaming = false)
  ▼
MessageBubble renders Markdown (react-markdown + remark-gfm)
  │  tables, lists, emojis, links, code
  │  "Download PDF" button
  │  Sources (web links)
  │  Follow-up suggestions (clickable chips)
```

---

## 3. Route handler: POST /api/chat

**File:** `backend-langgraph/src/routes/chat.ts`

The main handler — orchestrates the entire request lifecycle.

### 3a. Validation + create user and conversation

```ts
const internalUserId = await userService.findOrCreateUser(sessionId);
const conversationId = await conversationService.findOrCreateConversation(
  internalUserId, existingConvId, agentType,
);
```

### 3b. Parallel context loading

```ts
const [memories, history, ragContext, userPrefs] = await Promise.all([
  memoryService.getMemories(internalUserId, agentType),       // user_memories
  conversationService.getHistory(conversationId),             // messages table
  ragService.buildRagContext(message),                        // knowledge_base
  prefRepo.get(internalUserId),                               // user_preferences
]);
```

### 3c. Save user message (before graph starts — P0-2)

```ts
await conversationService.saveMessage(conversationId, 'user', message, undefined, undefined, internalUserId, agentType);
```

### 3d. Convert history → LangChain Message[]

**File:** `backend-langgraph/src/graph/history.ts`

```ts
const historyMessages = historyToMessages(history);
// user → HumanMessage
// assistant → lmRoundsToMessages() → AIMessage(tool_calls) + ToolMessage[] + AIMessage(text)
const initialMessages = [...historyMessages, humanMsg];
```

### 3e. Run graph + SSE streaming

```ts
const graph = agentType === 'shopping' ? getShoppingGraph() : getTravelGraph();

for await (const event of graph.streamEvents(
  { messages: initialMessages, userId, sessionId, conversationId, agentType, memories, taskListName, ragContext },
  { version: 'v2', signal: ac.signal }
)) {
  if (event.event === 'on_chat_model_stream') → SSE "text"
  if (event.event === 'on_tool_start')        → SSE "tool_start"
  if (event.event === 'on_tool_end')          → SSE "tool_end"
}
```

### 3f. Post-processing

```ts
// Save assistant response
conversationService.saveMessage(conversationId, 'assistant', assistantText, agentSteps, lmRounds, ...);
// Extract memory (every 3 messages or first-person statements)
memoryService.extractAndSaveMemories(internalUserId, message, agentType);
// Generate follow-up questions
suggestionService.getSuggestions(message, assistantText, agentType) → SSE "suggestions"
```

---

## 4. LangGraph: ReAct graph

### Graph construction

**File:** `backend-langgraph/src/graph/buildGraph.ts`

```ts
export function buildAgentGraph(tools, buildSystemPrompt) {
  const langchainTools = tools.map(wrapTool);  // BaseTool → DynamicStructuredTool

  return new StateGraph(AgentState)
    .addNode('reason', createReasonNode(buildSystemPrompt, langchainTools))
    .addNode('act', new ToolNode(langchainTools))
    .addEdge(START, 'reason')
    .addConditionalEdges('reason', shouldContinue, { act: 'act', [END]: END })
    .addEdge('act', 'reason')
    .compile();
}
```

### Graph topology

```
                     ┌──────────┐
        START ──────►│  reason  │◄──────────────┐
                     └────┬─────┘               │
                          │                     │
                   shouldContinue               │
                     ┌────┴─────┐               │
                     │          │               │
                   has         no               │
                tool_calls   tool_calls          │
                     │          │               │
                     ▼          └──► END        │
                ┌──────────┐                    │
                │   act    │────────────────────┘
                │ ToolNode │  (results → reason)
                └──────────┘
```

### AgentState

**File:** `backend-langgraph/src/graph/state.ts`

```ts
export const AgentState = Annotation.Root({
  messages:       Annotation<BaseMessage[]>({ reducer: messagesStateReducer }),
  userId:         Annotation<string>(),
  sessionId:      Annotation<string>(),
  conversationId: Annotation<string>(),
  agentType:      Annotation<'travel' | 'shopping'>(),
  memories:       Annotation<UserMemory[]>(),
  ragContext:     Annotation<string | null>(),
  taskListName:   Annotation<string>(),
});
```

### Graph configs

**File:** `backend-langgraph/src/graph/travelGraph.ts`
**File:** `backend-langgraph/src/graph/shoppingGraph.ts`

| Graph | Tools | System prompt |
|-------|-------|---------------|
| **travel** | WebSearch, Weather, CountryInfo, Currency, FlightSearch, HotelSearch, VisaRequirements, CarRental, TourSearch, SpaSearch, Calendar, Tasks, SearchConversations (13 tools) | `buildTravelAgentSystemPrompt(memories, userId, taskListName, ragContext)` |
| **shopping** | ProductSearch, PriceCompare, ProductReviews, DealSearch, Currency, WebSearch, Wishlist, PriceAlert, Calendar, Tasks, SearchConversations (11 tools) | `buildShoppingAgentSystemPrompt(memories, userId, taskListName, ragContext)` |

---

## 5. reasonNode: LLM invocation

**File:** `backend-langgraph/src/graph/nodes/reasonNode.ts`

```ts
const model = createModel('full', { streaming: true }).bindTools!(tools);

return async (state: AgentStateType) => {
  const response = await model.invoke([
    new SystemMessage({
      content: [{ type: 'text', text: buildSystemPrompt(state), cache_control: { type: 'ephemeral' } }]
    }),
    ...state.messages,
  ]);
  return { messages: [response] };
};
```

- `createModel('full')` → Anthropic Claude Sonnet or OpenAI GPT-4o
- `cache_control: { type: 'ephemeral' }` — Anthropic Prompt Caching
- `bindTools(tools)` — function calling

**File:** `backend-langgraph/src/llm/createModel.ts` — model factory
**File:** `backend-langgraph/src/agent/prompts.ts` — system prompt builder with memories, userId, ragContext

---

## 6. shouldContinue: router

**File:** `backend-langgraph/src/graph/nodes/shouldContinue.ts`

```ts
export function shouldContinue(state): 'act' | typeof END {
  const lastMessage = state.messages.at(-1);
  const toolCalls = (lastMessage as { tool_calls?: unknown[] })?.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) return 'act';
  return END;
}
```

---

## 7. act (ToolNode): tool execution

**File:** `backend-langgraph/src/tools/wrapTool.ts`
**File:** `backend-langgraph/src/tools/BaseTool.ts`

Each BaseTool is wrapped into a DynamicStructuredTool via `wrapTool()`:

```ts
// wrapTool converts JSONSchema → Zod and wraps execute()
export function wrapTool(baseTool): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: baseTool.name,
    schema: jsonSchemaToZod(baseTool.inputSchema),
    func: async (input) => {
      const result = await baseTool.execute(input);
      if (!result.success) return `ERROR: ${result.error}`;
      return JSON.stringify(result.data);
    },
  });
}
```

---

## 8. Provider layer: calendar and tasks

**File:** `backend-langgraph/src/tools/providers/UserAwareCalendarProvider.ts`
**File:** `backend-langgraph/src/tools/providers/UserAwareTasksProvider.ts`
**File:** `backend-langgraph/src/tools/providers/CalendarProvider.ts`
**File:** `backend-langgraph/src/tools/providers/TasksProvider.ts`

```
UserAwareCalendarProvider / UserAwareTasksProvider
  │  checks user_preferences.calendarProvider
  │
  ├── "google" → GoogleCalendarProvider / GoogleTasksProvider
  └── "apple"  → ICloudCalendarProvider / ICloudRemindersProvider
```

---

## 9. Services

| Service | File | Role |
|---------|------|------|
| ConversationService | `src/services/ConversationService.ts` | Save messages + async embeddings for vector search |
| MemoryService | `src/services/MemoryService.ts` | LLM-extract preferences → upsert into user_memories |
| RAGService | `src/services/RAGService.ts` | LLM gate → embedding → vector search → context |
| SuggestionService | `src/services/SuggestionService.ts` | LLM-generate 3 follow-up questions |
| UserService | `src/services/UserService.ts` | findOrCreate by session_id |
| EmbeddingService | `src/services/EmbeddingService.ts` | Voyage AI / random fallback |

---

## Summary diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│  page.tsx → ChatWindow.tsx → useStreamChat.ts → api.ts (POST)   │
└────────────────────────────────────────────────┬────────────────┘
                                                 │ POST /api/chat
                                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│          ROUTE: backend-langgraph/src/routes/chat.ts                │
│  1. Validate                                                        │
│  2. userService.findOrCreateUser()                                   │
│  3. conversationService.findOrCreateConversation()                   │
│  4. Parallel load: memories, history, ragContext, prefs             │
│  5. saveMessage('user', ...) — persists user message before graph  │
│  6. historyToMessages() — converts history to LangChain Message[]  │
│  7. graph.streamEvents({messages, ...}) — starts LangGraph          │
│  8. SSE stream: text, tool_start, tool_end, sources, suggestions   │
│  9. Post-processing: saveMessage('assistant'), extractAndSaveMem   │
└────────────────────────┬────────────────────────────────────────────┘
                         │ streamEvents v2
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│    GRAPH: backend-langgraph/src/graph/buildGraph.ts                 │
│                                                                     │
│                     ┌──────────┐                                    │
│        START ──────►│  reason  │◄──────────────┐                    │
│                     └────┬─────┘               │                    │
│                          │                     │                    │
│                   shouldContinue               │                    │
│                     ┌────┴─────┐               │                    │
│                     │          │               │                    │
│                   has         no               │                    │
│                tool_calls   tool_calls          │                    │
│                     │          │               │                    │
│                     ▼          └──► END        │                    │
│                ┌──────────┐                    │                    │
│                │   act    │────────────────────┘                    │
│                │ ToolNode │  (results → reason)                     │
│                └──────────┘                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Final data flow

```
User: "Find flights NYC→Paris June 5-12"
  │
  ▼
ChatWindow.sendMessage()
  │  dispatch(ADD, user msg)
  │  dispatch(ADD, assistant placeholder)
  ▼
api.ts POST /api/chat ──────────────────────► chat.ts route
  │                                              │
  │                                         findOrCreateUser()
  │                                         findOrCreateConversation()
  │                                              │
  │                         ┌────────────────────┼────────────────────┐
  │                         ▼                    ▼                    ▼
  │                   getMemories()       getHistory()        buildRagContext()
  │                   user_memories       messages table     knowledge_chunks
  │                         │                    │                    │
  │                         └────────────────────┼────────────────────┘
  │                                              ▼
  │                                   saveMessage('user', ...)
  │                                   historyToMessages(history)
  │                                              │
  │                                   graph.streamEvents({...})
  │                                              │
  │                    ┌─────────────────────────┼─────────────────────┐
  │                    ▼                         ▼                     ▼
  │              reasonNode               shouldContinue          act (ToolNode)
  │           (LLM invoke)               (check tool_calls)    (execute all tools)
  │                    │                         │                     │
  │              stream text ◄──────────────────┘─────────────────────► tool_results
  │                    │                                                  │
  │              SSE text chunk ◄─────────────────────────────────── SSE tool_end
  │                    │
  ▼                    ▼
◄──────── SSE stream ──────────────────►  ChatWindow (dispatch)
  │                                        STREAM_TEXT → accumulates content
  │                                        TOOL_START/TOOL_END → steps[]
  │                                        SET_SOURCES → sources[]
  │                                        MARK_DONE → streaming=false
  ▼
stream ends → saveMessage('assistant', ..., lmRounds)
            → extractAndSaveMemories()
            → SSE suggestions
            → SSE done
  │
  ▼
MessageBubble renders Markdown (react-markdown + remark-gfm)
  │  tables, lists, emojis, links, code
  │  "Download PDF" button
  │  Sources (web links)
  │  Follow-up suggestions (clickable chips)
```

## Key files

| # | File | Role |
|---|------|------|
| 1 | `frontend/src/components/chat/ChatWindow.tsx` | Chat UI |
| 2 | `frontend/src/hooks/useStreamChat.ts` | Streaming hook |
| 3 | `frontend/src/lib/api.ts` | POST + SSE parsing |
| 4 | `frontend/src/components/chat/MessageBubble.tsx` | Markdown renderer |
| 5 | `backend-langgraph/src/routes/chat.ts` | **Main handler** POST /api/chat |
| 6 | `backend-langgraph/src/index.ts` | DI + initialization |
| 7 | `backend-langgraph/src/graph/buildGraph.ts` | ReAct graph builder |
| 8 | `backend-langgraph/src/graph/state.ts` | AgentState |
| 9 | `backend-langgraph/src/graph/nodes/reasonNode.ts` | LLM invocation |
| 10 | `backend-langgraph/src/graph/nodes/shouldContinue.ts` | Router act/END |
| 11 | `backend-langgraph/src/graph/travelGraph.ts` | Travel graph (13 tools) |
| 12 | `backend-langgraph/src/graph/shoppingGraph.ts` | Shopping graph (11 tools) |
| 13 | `backend-langgraph/src/graph/history.ts` | DB → LangChain Messages |
| 14 | `backend-langgraph/src/agent/prompts.ts` | System prompts |
| 15 | `backend-langgraph/src/tools/BaseTool.ts` | Abstract tool |
| 16 | `backend-langgraph/src/tools/wrapTool.ts` | BaseTool → DynamicStructuredTool |
| 17 | `backend-langgraph/src/llm/createModel.ts` | Model factory |
| 18 | `backend-langgraph/src/services/ConversationService.ts` | Save + embeddings |
| 19 | `backend-langgraph/src/services/MemoryService.ts` | Memory extraction |
| 20 | `backend-langgraph/src/services/RAGService.ts` | RAG pipeline |
| 21 | `backend-langgraph/src/services/SuggestionService.ts` | Follow-up questions |
| 22 | `backend-langgraph/src/tools/providers/UserAwareCalendarProvider.ts` | Calendar delegation |
| 23 | `backend-langgraph/src/tools/providers/UserAwareTasksProvider.ts` | Tasks delegation |
