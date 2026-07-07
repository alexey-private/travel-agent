# Deploying to Railway

One Railway project, four services, built from the Dockerfiles at the repo
root ([Dockerfile.backend-langgraph](Dockerfile.backend-langgraph),
[Dockerfile.backend-telegram](Dockerfile.backend-telegram),
[Dockerfile.frontend](Dockerfile.frontend)). `backend/` (legacy ReAct) is not
deployed — it's frozen.

For every app service (not the DB): **Root Directory = `/`** (repo root,
required for the npm workspaces build context), **Builder = Dockerfile**,
Dockerfile Path = the file listed above for that service.

**Service names matter**: the `${{service.VARIABLE}}` references below only
resolve if the service is actually named `postgres` / `backend-langgraph` as
written. Railway defaults a "Deploy an image" service to the image name
(e.g. `pgvector`) and a "GitHub Repo" service to the repo name (e.g.
`travel-agent`) — rename each one via **Settings → Service Name** right
after creating it, or adjust every `${{...}}` reference below to match
whatever you actually named it. A wrong reference doesn't error at save
time — it silently resolves to garbage and only surfaces later as
`TypeError: Invalid URL` in the consuming service's runtime logs.

## 1. Postgres + pgvector

Railway's built-in Postgres plugin does **not** ship the `pgvector`
extension, so deploy it as a plain Docker service instead of using "New →
Database":

1. New service → **Deploy an image** → `pgvector/pgvector:pg16`. Rename the
   service to `postgres` (see the naming note above — Railway defaults it to
   `pgvector`).
2. Volumes are **not** under this service's Settings tab. Right-click empty
   space on the project canvas (or `⌘K`) → create a **Volume** → attach it to
   this service → Mount Path: `/var/lib/postgresql/data`. Without it, every
   redeploy wipes the database.
3. Variables: `POSTGRES_DB=travel_agent`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
   (generate a strong password), and **`PGDATA=/var/lib/postgresql/data/pgdata`**.
   Without `PGDATA`, `initdb` refuses to start with `directory
   "/var/lib/postgresql/data" exists but is not empty (lost+found)` — Railway
   volumes always contain a `lost+found` dir, and Postgres won't `initdb`
   straight into a non-empty mount point. Pointing `PGDATA` at a subdirectory
   of the mount avoids this.
4. Do **not** expose a public domain for this service — only the other
   services on the same Railway project need to reach it, over the private
   network.
5. Compose `DATABASE_URL` for the other services from the pieces above:
   `postgresql://${{postgres.POSTGRES_USER}}:${{postgres.POSTGRES_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.POSTGRES_DB}}`

## 2. backend-langgraph

Dockerfile Path: `Dockerfile.backend-langgraph`. Its `CMD` already runs the
idempotent migration runner (`dist/db/migrate.js`, tracked via
`schema_migrations`) before starting the server — no separate release step
needed. Generate a public domain for this service; health check path `/health`.

Clicking **Generate Domain** before the first successful deploy shows a
placeholder ("Public domain will be generated") instead of a real URL —
Railway detects the port from an actual running deployment, so it can't
finalize the domain until the service has deployed at least once. Configure
the variables below and deploy; the real `*.up.railway.app` URL appears
once the container is up.

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
| `NEXT_PUBLIC_FRONTEND_URL` | `https://<frontend-service-domain>` — required if using Google Calendar/Tasks (see below) |
| `ENCRYPTION_KEY` | 32+ char random string, only if using iCloud |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | if using web push |
| `ALLOWED_ORIGIN` | `https://<frontend-service-domain>` |

`NEXT_PUBLIC_FRONTEND_URL` is read directly via `process.env` in
[auth.ts](backend-langgraph/src/routes/auth.ts) (not through the validated
`env` object, and not the same thing as `ALLOWED_ORIGIN`) to build the
redirect after the Google OAuth callback finishes. Without it, the fallback
is `http://localhost:3000` — the callback will complete and tokens will
save correctly, but the user's browser ends up redirected to localhost
instead of the deployed frontend.

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
| `PORT` | `3000` |

Changing any of these requires a redeploy (rebuild for the `NEXT_PUBLIC_*`
ones, restart is enough for `PORT`), not just a restart.

Set `PORT=3000` explicitly — Railway auto-injects `PORT=8080` for services
that don't set their own, but the standalone Next.js server this Dockerfile
produces listens on whatever `PORT` it's given, and the generated domain
targets port 3000 (matching the Dockerfile's `EXPOSE 3000`). Without this
variable the domain returns `502` even though the build and container start
up fine — check the actual "Local: http://...:<port>" line in the runtime
logs if this happens again.

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

## Troubleshooting

Install the Railway CLI (`npm i -g @railway/cli`, may need `sudo`) and run
`railway login` + `railway link --project travel-agent` once from a checkout
of this repo. After that:

```bash
railway status                            # per-service deploy status
railway logs --service <name>             # runtime logs (build logs too, mid-build)
railway variable list --service <name>    # variable names (add --kv for values — careful, prints secrets)
railway variable set KEY=value --service <name>
```

`railway logs` is the fastest way to diagnose a `502 Application failed to
respond`: it almost always means the container crashed on boot (missing
required env var → `env.ts`'s zod schema throws, or a DB connection error in
`migrate.js`, which blocks `index.js` from ever starting since the
Dockerfile `CMD` is `migrate.js && index.js`) rather than a networking issue.

## Cost note

Four always-on services plus a Postgres instance won't fit Railway's pure
free trial credit for long — budget for the Hobby plan (~$5/mo base +
usage).
