# Deploying to Railway

One Railway project, four services, built from the Dockerfiles at the repo
root ([Dockerfile.backend-langgraph](Dockerfile.backend-langgraph),
[Dockerfile.backend-telegram](Dockerfile.backend-telegram),
[Dockerfile.frontend](Dockerfile.frontend)). `backend/` (legacy ReAct) is not
deployed — it's frozen.

For every app service (not the DB): **Root Directory = `/`** (repo root,
required for the npm workspaces build context), **Builder = Dockerfile**,
Dockerfile Path = the file listed above for that service.

## 1. Postgres + pgvector

Railway's built-in Postgres plugin does **not** ship the `pgvector`
extension, so deploy it as a plain Docker service instead of using "New →
Database":

1. New service → **Deploy an image** → `pgvector/pgvector:pg16`.
2. Add a **Volume** mounted at `/var/lib/postgresql/data` (without it, every
   redeploy wipes the database).
3. Variables: `POSTGRES_DB=travel_agent`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
   (generate a strong password).
4. Do **not** expose a public domain for this service — only the other
   services on the same Railway project need to reach it, over the private
   network.
5. Note the service name (e.g. `postgres`) — Railway lets other services
   reference `${{postgres.RAILWAY_PRIVATE_DOMAIN}}` and you can compose
   `DATABASE_URL` from the pieces above:
   `postgresql://${{postgres.POSTGRES_USER}}:${{postgres.POSTGRES_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.POSTGRES_DB}}`

## 2. backend-langgraph

Dockerfile Path: `Dockerfile.backend-langgraph`. Its `CMD` already runs the
idempotent migration runner (`dist/db/migrate.js`, tracked via
`schema_migrations`) before starting the server — no separate release step
needed. Generate a public domain for this service; health check path `/health`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | from step 1 |
| `LLM_PROVIDER` | `anthropic` |
| `ANTHROPIC_API_KEY` | your key |
| `TAVILY_API_KEY` | required |
| `OPENWEATHER_API_KEY` | required |
| `VOYAGE_API_KEY` | optional (random-vector fallback if unset) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | if using Google Calendar/Tasks |
| `GOOGLE_REDIRECT_URI` | `https://<this-service-domain>/auth/google/callback` |
| `ENCRYPTION_KEY` | 32+ char random string, only if using iCloud |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | if using web push |
| `ALLOWED_ORIGIN` | `https://<frontend-service-domain>` |

`PORT` — do not set it manually; Railway injects it and
[env.ts](backend-langgraph/src/config/env.ts) already reads
`process.env.PORT`.

**After the first deploy**, update the Google Cloud Console OAuth
credentials' authorized redirect URI to match `GOOGLE_REDIRECT_URI` above —
the old `localhost` one won't work in production.

## 3. backend-telegram

Dockerfile Path: `Dockerfile.backend-telegram`. This runs grammY in
long-polling mode (`bot.start()`) — **no public domain, no exposed port**.

| Variable | Value |
|---|---|
| `BOT_TOKEN` | from @BotFather |
| `BACKEND_URL` | `http://${{backend-langgraph.RAILWAY_PRIVATE_DOMAIN}}:<port>` — use the private domain, not the public one, to avoid an unnecessary public-network hop |
| `OPENWEATHER_API_KEY` | required |
| `OPENAI_API_KEY` | if voice transcription is enabled |
| `NOTIFY_HOUR` | optional, defaults to `9` |

## 4. frontend

Dockerfile Path: `Dockerfile.frontend`. Generate a public domain.

`NEXT_PUBLIC_*` variables are inlined into the JS bundle at **build time**.
The Dockerfile declares matching `ARG`s, and Railway forwards Service
Variables as Docker build-args automatically — just set them as normal
Variables on this service:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend-langgraph-public-domain>` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same value as `VAPID_PUBLIC_KEY` on backend-langgraph, if using web push |

Changing either of these requires a redeploy (rebuild), not just a restart.

## 5. GitHub auto-deploy

Connect each of the 3 app services to the same GitHub repo/branch (`main`).
In each service's settings, set **Watch Paths** so an unrelated change
doesn't trigger a pointless rebuild:

- backend-langgraph: `backend-langgraph/**`, `Dockerfile.backend-langgraph`
- backend-telegram: `backend-telegram/**`, `Dockerfile.backend-telegram`
- frontend: `frontend/**`, `Dockerfile.frontend`

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs tsc + full test
suite (incl. integration tests against a real `pgvector/pgvector:pg16`
service container) for backend-langgraph and backend-telegram, plus
lint/typecheck/build for frontend, on every push/PR to `main`. Add a branch
protection rule requiring this check before merging, so Railway only ever
auto-deploys code that already passed CI.

## 6. First-deploy smoke test

- `GET https://<backend-langgraph-domain>/health` → `{"status":"ok",...}`
- Open the frontend URL, send a chat message, confirm a reply streams back.
- Google OAuth connect flow in Settings (if configured) completes and
  redirects back correctly.
- Message the Telegram bot — confirm it reaches backend-langgraph over the
  private network and replies.
- Check `conversation_embeddings` gets populated (confirms the `vector`
  extension migration applied) and that vector search recall works via the
  chat UI referencing an earlier conversation.

## Cost note

Four always-on services plus a Postgres instance won't fit Railway's pure
free trial credit for long — budget for the Hobby plan (~$5/mo base +
usage).
