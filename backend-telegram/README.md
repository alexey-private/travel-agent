# Travel Agent — Telegram Bot

Telegram frontend for the Travel & Shopping AI agent. Bridges user messages to `backend-langgraph` over SSE.

---

## 1. Register the bot with BotFather

1. Open Telegram and start a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Choose a **display name** (shown in chats), e.g. `Travel Agent`.
4. Choose a **username** (must end in `bot`), e.g. `my_travel_agent_bot`.
5. BotFather replies with your **bot token** — copy it, you'll need it in the next step.

### Set bot commands (optional but recommended)

Still in BotFather, send `/setcommands`, select your bot, then paste:

```
start - Show welcome message and quick examples
travel - Switch to Travel Agent mode
shopping - Switch to Shopping Agent mode
mode - Show current agent mode
calendar - List upcoming calendar events
connect - Link your Google account (Calendar & Tasks)
clear - Reset conversation
```

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=1234567890:ABCDefgh...   # token from BotFather
BACKEND_URL=http://localhost:3002  # URL of the running backend-langgraph
```

---

## 3. Run

Make sure `backend-langgraph` is running first, then:

```bash
# From the repo root
npm run dev:telegram

# Or from this directory
npm run dev
```

The bot uses **long-polling** by default — no public URL or webhook setup required for local development.

---

## Architecture

```
Telegram user
     │
     ▼
 grammY bot  (this package)
     │  POST /api/chat  (SSE)
     ▼
backend-langgraph  :3002
     │
     ├─ LangGraph travel agent
     ├─ LangGraph shopping agent
     ├─ PostgreSQL + pgvector (conversation history, RAG)
     └─ Google Calendar / iCloud CalDAV
```

Each Telegram user gets a stable session key `tg-<userId>` that maps to a row in the `users` table — the same user always continues the same conversation history.

### SSE event flow

```
bot sends POST /api/chat
  ← { type: 'conversation_id', conversationId }
  ← { type: 'tool_start', tool: 'web_search', ... }
  ← { type: 'text', content: '...' }   (streamed, bot edits message)
  ← { type: 'done' }
```

---

## Commands reference

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + inline keyboard with starter prompts |
| `/travel` | Switch to Travel Agent (flights, hotels, weather, visas…) |
| `/shopping` | Switch to Shopping Agent (products, prices, comparisons…) |
| `/mode` | Show current agent mode and session ID |
| `/calendar` | Ask the agent to list upcoming events (requires Google account) |
| `/connect` | Get a personal Google OAuth link to enable Calendar & Tasks |
| `/clear` | Reset conversation — next message starts fresh |
