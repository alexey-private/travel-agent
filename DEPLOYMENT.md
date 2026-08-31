# Deploying to Railway

One Railway project, four services, built from the Dockerfiles at the repo
root ([Dockerfile.backend-langgraph](Dockerfile.backend-langgraph),
[Dockerfile.backend-telegram](Dockerfile.backend-telegram),
[Dockerfile.frontend](Dockerfile.frontend)).

For every app service (not the DB): **Root Directory = `/`** (repo root,
required for the npm workspaces build context), **Builder = Dockerfile**,
Dockerfile Path = the file listed above for that service.

**Service names**: two of the four Railway services are *not* named after
the workspace they run. Railway names a "Deploy an image" service after the
image and a "GitHub Repo" service after the repo, and those defaults were
kept:

| Railway service | Runs | Dockerfile / image |
|---|---|---|
| `travel-agent` | `backend-langgraph/` | `Dockerfile.backend-langgraph` |
| `pgvector` | Postgres 16 + pgvector | `pgvector/pgvector:pg16` |
| `backend-telegram` | `backend-telegram/` | `Dockerfile.backend-telegram` |
| `frontend` | `frontend/` | `Dockerfile.frontend` |

These are the names to pass to `railway logs --service …` and the names every
`${{service.VARIABLE}}` reference below is written against. If you rebuild the
project from scratch and choose different ones, update every `${{...}}`
reference to match — a wrong reference doesn't error at save time, it
silently resolves to garbage and only surfaces later as `TypeError: Invalid
URL` in the consuming service's runtime logs.

## 1. Postgres + pgvector — Railway service `pgvector`

Railway's built-in Postgres plugin does **not** ship the `pgvector`
extension, so deploy it as a plain Docker service instead of using "New →
Database":

1. New service → **Deploy an image** → `pgvector/pgvector:pg16`. Railway
   names the service `pgvector` after the image — keep that name, it is what
   the `${{pgvector.*}}` references below resolve against.
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
   `postgresql://${{pgvector.POSTGRES_USER}}:${{pgvector.POSTGRES_PASSWORD}}@${{pgvector.RAILWAY_PRIVATE_DOMAIN}}:5432/${{pgvector.POSTGRES_DB}}`

## 2. backend-langgraph — Railway service `travel-agent`

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
| `OPENAI_API_KEY` | required for voice message transcription (`/api/transcribe`) — without it the endpoint returns `503`. This is the only copy: the web mic button and Telegram voice notes both go through this route, so the bot needs no key of its own |
| `VOYAGE_API_KEY` | optional (random-vector fallback if unset) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | if using Google Calendar/Tasks |
| `GOOGLE_REDIRECT_URI` | `https://<this-service-domain>/auth/google/callback` |
| `NEXT_PUBLIC_FRONTEND_URL` | `https://<frontend-service-domain>` — required if using Google Calendar/Tasks (see below) |
| `ENCRYPTION_KEY` | **required when `NODE_ENV=production`** (the service refuses to start without it), 32+ char random string. Only iCloud credentials are encrypted with it, but the check is unconditional: a deploy that omits it used to silently fall back to a key committed to this repository |
| `INTERNAL_API_SECRET` | **required if the Telegram bot is deployed.** A long random string, set to the *same value* on this service and on `backend-telegram`. Without it every Telegram-scoped request is refused with `503` and `/connect` stops working — see the note below |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | if using web push |
| `ALLOWED_ORIGIN` | **required when `NODE_ENV=production`** (the service refuses to start without it) — `https://<frontend-service-domain>`, or several comma-separated. See the note below |
| `TRUST_PROXY` | optional — leave unset on Railway. Which peers may speak for the caller through `X-Forwarded-For`; the default trusts the private and carrier-NAT ranges an edge proxy reaches a container from. See the note below |
| `PORT` | `3002` — recommended; see note below |

`NEXT_PUBLIC_FRONTEND_URL` is read directly via `process.env` in
[auth.ts](backend-langgraph/src/routes/auth.ts) (not through the validated
`env` object, and not the same thing as `ALLOWED_ORIGIN`) to build the
redirect after the Google OAuth callback finishes. Without it, the fallback
is `http://localhost:3000` — the callback will complete and tokens will
save correctly, but the user's browser ends up redirected to localhost
instead of the deployed frontend.

**About `ALLOWED_ORIGIN`** — a request to this API carries no credential beyond
a `userId` in its body, so the origin check is the whole of what keeps an
unrelated page in the user's browser from making one. It is an allowlist, never
a reflection of whatever `Origin` arrives: an origin outside the list gets no
`Access-Control-Allow-Origin` back and the browser refuses to hand the response
to the page. Set it to the frontend's own URL, scheme included and no trailing
slash (`https://app.example.com`); separate several with commas if more than one
front end talks to this backend.

A production deploy without it refuses to start, because there is no safe
reading of the omission — the alternatives are refusing every browser or
trusting all of them, and the second is what this variable's absence used to
mean. Development needs no value: `localhost` and `127.0.0.1` on any port are
allowed there, since the frontend's own port already makes it cross-origin.
Nothing outside a browser is affected either way, so the Telegram bridge, which
sends no `Origin` at all, needs no entry.

**About `TRUST_PROXY`** — the rate limiter counts a web caller by `req.ip`,
because a `userId` is a value the browser chose and rotating it would otherwise
buy an unlimited budget. Behind a proxy, `req.ip` is the proxy unless the proxy
is trusted, and then every user in the world is counted as one caller: the limit
becomes an outage at 30 requests a minute rather than a defence. The default
trusts `loopback, linklocal, uniquelocal, 100.64.0.0/10` — ranges an edge proxy
plausibly reaches a container from and a public client cannot arrive from — and
only the entry *that* peer appended is believed, so a caller prepending hops of
their own gains nothing.

If the platform's proxy is outside those ranges, the backend says so in the log
on the first request that shows it:

```
X-Forwarded-For arrived from a peer TRUST_PROXY does not trust — every web
caller is being rate limited as one. Add this peer to TRUST_PROXY.
```

The line carries the peer address; add it (or its range) to `TRUST_PROXY` as a
comma-separated list. Set it to an empty string when clients reach the server
directly with no proxy at all.

Do not widen it to ranges a client can actually arrive from just to make the
warning go away. With every peer trusted, `req.ip` becomes the *first* entry of
the header — the part the caller wrote — and rotating that buys a fresh budget
per request, which is the bypass this key exists to close. The value is a list
of addresses and ranges, and the parser rejects both `true` and a literal
`0.0.0.0/0`, so "trust everything" cannot be reached by a typo; a value Fastify
cannot parse stops the process at startup instead of degrading the limit
quietly.

**About `INTERNAL_API_SECRET`** — a web visitor's session id is a random
UUID, unguessable, and that is the only thing standing between a request and
the data behind it. A Telegram user's session id is `tg-<telegram user id>`,
built from a number anyone sharing a group with them can read, so it cannot
protect anything on its own. The backend therefore refuses to answer for a
`tg-` id unless the caller presents this secret in an `x-internal-secret`
header, and the `/connect` consent link — which a browser opens, and so cannot
carry a header — is signed with it instead. Both services must hold the same
value; there is no default, and the backend logs an error on startup when it is
missing. Generate one with `openssl rand -hex 32`.

Deploying the backend with this set while the bot still lacks it (or the
reverse) takes the bot offline until both agree — set it on both services
before redeploying either.

**About `PORT`** — Railway does **not** inject `PORT` into this service
(despite what you might expect), so the container falls back to the default in
[env.ts](backend-langgraph/src/config/env.ts). That default is now **3002**,
matching `EXPOSE 3002` and the private-network port `backend-telegram`'s
`BACKEND_URL` points at, so leaving `PORT` unset is safe. Setting it anyway is
still recommended: it makes the port visible in the Railway UI instead of
implicit in the source.

Historical note, kept because the failure mode is easy to re-create by
setting `PORT` to something *wrong*: the public domain works regardless —
Railway auto-detects whatever port the container actually opens and proxies
to it (`targetPort: null`). But `backend-telegram` reaches this service over
the **private network** (`travel-agent.railway.internal:3002`), a plain TCP
address with no such detection — it connects only if the container really
listens on the port named in the URL. A mismatch makes every Telegram request
fail with `Cannot reach backend: fetch failed` while `/health` on the public
domain still returns 200, so the breakage is invisible from the public side.
Same underlying gotcha as `frontend`'s `PORT` below, just surfacing through
the private network instead of a public domain. Until 2026-08-24 the default
was `3001` (inherited from the deleted legacy `backend/` workspace), which
made this the *default* outcome rather than a misconfiguration.

**After the first deploy**, update the Google Cloud Console OAuth
credentials' authorized redirect URI to match `GOOGLE_REDIRECT_URI` above —
the old `localhost` one won't work in production.

## 3. backend-telegram — Railway service `backend-telegram`

Dockerfile Path: `Dockerfile.backend-telegram`. This runs grammY in
long-polling mode (`bot.start()`) — **no public domain, no exposed port**.

| Variable | Value |
|---|---|
| `BOT_TOKEN` | from @BotFather |
| `BACKEND_URL` | `http://${{travel-agent.RAILWAY_PRIVATE_DOMAIN}}:3002` (resolves to `travel-agent.railway.internal`) — use the private domain, not the public one, to avoid an unnecessary public-network hop for the bot's own server-to-server calls (chat, history, calendar cron). The port **must** match whatever `PORT` is actually set to on the `travel-agent` service (see below) — there's no auto-detection over the private network like there is for public domains |
| `BACKEND_PUBLIC_URL` | `https://<travel-agent-public-domain>` — **required**, separate from `BACKEND_URL` above. Used only for links sent *to the user* (currently `/connect`'s Google OAuth link). `*.railway.internal` addresses only resolve inside Railway's private network — a user's own browser can't open them, so without this set explicitly the `/connect` link is broken even though every other bot feature works fine |
| `OPENWEATHER_API_KEY` | required |
| `INTERNAL_API_SECRET` | **required.** Must be byte-for-byte the same value as on the `travel-agent` service. Without it every backend call this bot makes comes back `403` and `/connect` refuses to issue a link |
| `NOTIFY_HOUR` | optional, defaults to `9` |

## 4. frontend — Railway service `frontend`

Dockerfile Path: `Dockerfile.frontend`. Generate a public domain.

`NEXT_PUBLIC_*` variables are inlined into the JS bundle at **build time**.
The Dockerfile declares matching `ARG`s, and Railway forwards Service
Variables as Docker build-args automatically — just set them as normal
Variables on this service:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend-langgraph-public-domain>` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same value as `VAPID_PUBLIC_KEY` on backend-langgraph, if using web push |
| `NEXT_PUBLIC_SHOPPING_ENABLED` | optional — set to `false` to hide the Shopping tab (defaults to enabled/`true` if unset) |
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
doesn't trigger a pointless rebuild. The values themselves live in
[deploy/railway-services.json](deploy/railway-services.json) — one copy, read by
both of the checks below, rather than a table here that can drift from the
dashboard without anyone noticing. Railway stores them with a leading slash
(`/shared/**`); the dashboard adds it.

Two of the four entries are on all three lists on purpose, and for the same
reason: both are build inputs of every image.

- `shared/**` — `shared/i18n` is compiled into every service, so a change there
  that redeployed only one of them would leave the other two running the old
  locale set.
- `tsconfig.base.json` — every `COPY package.json package-lock.json
  tsconfig.base.json ./` line pulls it into the image, and
  `backend-langgraph/`, `backend-telegram/` and `shared/i18n/` all `extends` it.
  Changing `target`, `strict` or `outDir` there changes what all three builds
  emit; the frontend inherits it too, through the `shared/i18n` compile its own
  build runs. It changes perhaps twice a year, so watching it costs nothing and
  the alternative is three services quietly running code built under the old
  compiler options.

Note that a change to `package.json` / `package-lock.json` at the repo root
matches none of these, so a dependency change alone will not trigger a
rebuild — touch the relevant Dockerfile or redeploy by hand. That one is a
deliberate trade and not the same case as `tsconfig.base.json`: the lock file
changes constantly and usually for one workspace, and its effect on an image is
visible in that workspace's own diff.

Two checks keep that file honest, split by whether they need a credential:

- `npm run test:deploy` reads the `COPY` lines of every Dockerfile and fails
  when a build input is not covered by that service's patterns. No network and
  no token, so it runs in the `deploy-config` CI job on every push and PR — a
  new build input goes red in the commit that introduces it, before anything
  deploys.
- `npm run check:railway-drift` compares the file against the live Railway API
  and exits non-zero on a difference. It needs a **project** token in
  `RAILWAY_TOKEN` — project Settings → Tokens, scoped to one environment — or
  an account/workspace token in `RAILWAY_API_TOKEN`; the two authenticate
  through different headers, which is why they are separate variables. Locally
  it falls back to the credential `railway login` leaves in
  `~/.railway/config.json`, which expires within hours. It runs weekly from
  [.github/workflows/railway-drift.yml](.github/workflows/railway-drift.yml).
  It is read-only: it reports a difference and never repairs one, because a
  script that writes production config turns a wrong file into a wrong
  deployment.

Both exist because on 2026-08-31 `shared/**` was missing from all three
services for the whole day the shared package existed, and nothing in the
repository could have said so — see
[the spec](docs/superpowers/specs/2026-08-31-railway-deploy-config-in-the-repo.md).

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs tsc + full test
suite (incl. integration tests against a real `pgvector/pgvector:pg16`
service container) for backend-langgraph and backend-telegram, plus
lint/typecheck/build for frontend, on every push/PR to `main`. Add a branch
protection rule requiring this check before merging, so Railway only ever
auto-deploys code that already passed CI.

## 6. First-deploy smoke test

- `GET https://<travel-agent-domain>/health` → `{"status":"ok",...}`
- Open the frontend URL, send a chat message, confirm a reply streams back.
- Google OAuth connect flow in Settings (if configured) completes and
  redirects back correctly.
- Message the Telegram bot — confirm it reaches `travel-agent` over the
  private network and replies.
- Check `conversation_embeddings` gets populated (confirms the `vector`
  extension migration applied) and that vector search recall works via the
  chat UI referencing an earlier conversation.

## Troubleshooting

Install the Railway CLI (`npm i -g @railway/cli`, may need `sudo`) and run
`railway login` + `railway link --project travel-agent` once from a checkout
of this repo. After that:

`<name>` below is one of `travel-agent`, `pgvector`, `backend-telegram`,
`frontend` (see the service-name table at the top).

```bash
railway status                            # per-service deploy status
railway logs --service <name>             # runtime logs (build logs too, mid-build)
railway logs --service <name> --network   # private-network flow log: shows which port inbound TCP actually lands on
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
