# Getting Railway's deploy config under review

**Date:** 2026-08-31
**Status:** implemented 2026-08-31 — `deploy/railway-services.json`, the
coverage test and the read-only drift script are in the repo; the two watch-path
corrections the spec was written about (`shared/**`, then `tsconfig.base.json`)
were applied by hand in Railway before that. One acceptance criterion is left
open on purpose: the scheduled drift run needs a `RAILWAY_TOKEN` repository
secret that only the repo owner can add.
**Origin:** [the 2026-08-31 watch-paths incident](#what-happened) — `shared/**` was
missing from all three services' watch paths for the whole day the shared package
existed, and nothing in the repository could have said so.

---

## What happened

`shared/i18n` became a fourth workspace on 2026-08-31 and is compiled into all
three service images. [DEPLOYMENT.md](../../../DEPLOYMENT.md) says each service's
Railway **Watch Paths** must therefore include `shared/**`. None of them did:

```
frontend          /frontend/**            /Dockerfile.frontend
backend-telegram  /backend-telegram/**    /Dockerfile.backend-telegram
travel-agent      /backend-langgraph/**   /Dockerfile.backend-langgraph
```

A commit touching only `shared/i18n` would have redeployed nothing, and the three
services would have drifted onto different copies of the locale set while every
health check stayed green. It went unnoticed because that day's push happened to
touch files in all three packages as well.

Fixed the same day by adding `/shared/**` to each of the three. **This spec is not
about that fix** — it is about the reason nobody knew for a day: the setting lives
in Railway, and the repository has no way to see it, test it, or review a change
to it. `DEPLOYMENT.md` records what the values are *supposed* to be, which is
documentation of an intent, not a check of a fact.

The same is true of two neighbouring settings that also exist only in the
dashboard: **Builder** (Dockerfile vs Railpack) and **Dockerfile Path**. Both have
already cost a debugging session each — see
[[project_railway_deployment]] in memory.

### The API, for whatever we build

Railway's public GraphQL API reads and writes all three. This is worth writing
down because the project memory asserted the opposite for two months, and that
false belief is the whole reason nobody checked.

```
POST https://backboard.railway.com/graphql/v2
Authorization: Bearer <token>
User-Agent: railway-cli/5.23.3      # omit this and the API answers 403, not 401

query($id: String!) { project(id: $id) { services { edges { node { id name
  serviceInstances { edges { node { environmentId watchPatterns
    rootDirectory source { repo image } } } } } } } } }
```

`mutation serviceInstanceUpdate(serviceId, environmentId, input)` writes; the
update is partial, so an input carrying only `watchPatterns` leaves every other
setting alone. Project `2f74ec36-d058-42fd-87b0-b4bc397dddcc`, environment
`production` `5bffd001-7eae-4723-bf10-0d6da29bf008`.

---

## The obvious plan, and why it fails

The obvious move is Railway's config-as-code: put the settings in the repo, where
a diff shows them and a reviewer reads them. Railway has **two** such systems, and
neither does what this project needs today.

### `.railway/railway.ts` — Infrastructure as Code

The current, non-deprecated system. `railway config init` / `pull` / `plan` /
`apply` in CLI 5.23.3 drive it, and it needs `npm install railway` in the repo.

Two disqualifying properties, both from
[the IaC reference](https://docs.railway.com/infrastructure-as-code/reference):

1. **It does not model the settings we care about.** `service()` accepts `source`,
   `build`, `start`, `healthcheck`, `healthcheckTimeout`, `replicas`, `env`,
   `domains`, `volumeMounts`. There is no `watchPatterns`, no `dockerfilePath`, no
   builder selection, and no documented escape hatch for fields the DSL does not
   cover. Adopting it would leave this incident's setting exactly where it is.
2. **Omit means delete.** The model is "one project definition, one apply, omit
   means delete" — a file that fails to mention a resource is an instruction to
   remove it. Putting a live four-service production project behind that, in
   exchange for zero coverage of the problem being solved, is a bad trade.

### `railway.json` / `railway.toml` — Config as Code

The older system, and the one that *does* cover the problem: `build.watchPatterns`,
`build.builder`, `build.dockerfilePath`, plus deploy-side `healthcheckPath`,
`restartPolicyType`, `cronSchedule`. Config in code overrides the dashboard, and a
service can be pointed at a custom path (`/railway.frontend.json`), which is what a
monorepo with three services in one repo needs.

It is **deprecated, and stops working on 2026-12-01** — thirteen weeks from this
spec. Worse, the two systems are mutually exclusive: a service managed by
`railway.json` makes `railway config plan` refuse until it is migrated. Adopting it
means doing this work twice and adding a migration deadline to the calendar.

---

## What to build instead

Not a migration. **A check.** The value being chased is not "the setting is
declared in TypeScript" — it is "the repository notices when the setting is
wrong." That is reachable now, cheaply, without betting on either format, and it
keeps working whichever one wins.

Two independent pieces, deliberately split by whether they need credentials.

### 1. Coverage test — no credentials, runs in normal CI

The failure was not that someone edited the dashboard. It was that a **new build
input appeared in the repo** and nothing connected it to the deploy config. That
connection is derivable from files we already have:

- Each `Dockerfile.<service>` declares what it copies out of the repo — `COPY
  shared ./shared` is exactly the evidence that `shared/` is a build input for
  that image.
- Each service's expected watch patterns live in a new committed file (below).

The test walks the `COPY` lines of each Dockerfile and asserts that some watch
pattern of that Dockerfile's service matches each source. On 2026-08-31 morning it
goes red the moment `COPY shared ./shared` enters `Dockerfile.frontend`, in the
same commit, before any deploy — which is the whole point. It needs no network and
no token, so it belongs in the ordinary test run.

**A naive "first path segment" rule is wrong here**, and the current Dockerfiles
show why. All three copy *every* workspace's manifest, because `npm ci` needs the
whole workspace graph present to resolve it:

```
Dockerfile.frontend:13   COPY backend-langgraph/package.json ./backend-langgraph/package.json
Dockerfile.frontend:20   COPY shared ./shared
Dockerfile.frontend:26   COPY frontend ./frontend
```

Taking the first segment of every source would demand that `frontend` watch
`/backend-langgraph/**` — producing exactly the pointless cross-service rebuilds
watch paths exist to prevent. The distinction the test must draw is between a
**whole-directory** copy (`COPY shared ./shared`) — a real build input, whose
contents change what the image contains — and a **single-file manifest** copy,
which is scaffolding for the package manager. Only the first kind is required to
be covered. `COPY --from=<stage>` lines are intra-image and excluded outright.

"Single file ⇒ scaffolding" is not the rule either, though, and
`tsconfig.base.json` is why: it arrives on the same `COPY package.json
package-lock.json tsconfig.base.json ./` line as the two manifests and is a real
build input, because three of the four workspaces `extends` it. The honest
version of the rule is a short named list — `package.json` and
`package-lock.json` are the exclusions, everything else copied is covered — so a
fourth root-level file added to that line is covered by default and someone has
to argue it out rather than have the test wave it through.

Two exclusions to encode deliberately, not by accident:

- Root-level `package.json` / `package-lock.json` match no pattern **by design** —
  a dependency bump alone triggers no rebuild, which `DEPLOYMENT.md` documents.
  The test must assert that as intended behaviour rather than let it fail.
- `tsconfig.base.json` was in the same position when this spec was written, and
  is **no longer**: it is now watched by all three services. It was a real gap of
  the same shape as the `shared/**` one — `backend-langgraph/`,
  `backend-telegram/` and `shared/i18n/` all `extends` it, so `target`, `strict`
  or `outDir` changing there changes what every image emits and rebuilt none of
  them. It changes about twice a year, which is what settles the judgement the
  earlier draft left open: the cost of watching it is a rebuild nobody will
  notice, the cost of not watching it is three services silently built under
  different compiler options. The test must assert it is covered, not excluded.

### 2. Drift check — needs a token, runs on a schedule

The committed expectation file is only a claim until something compares it to
Railway. A script queries the API above and diffs live `watchPatterns` per service
against the file, exiting non-zero with a readable diff.

- Auth by `RAILWAY_TOKEN` (a project token) from GitHub Actions secrets, falling
  back to `~/.railway/config.json`'s `accessToken` for local runs.
- Scheduled weekly plus on push to `main`. Not a required status check on PRs: a
  PR cannot change Railway, so blocking merges on the state of a dashboard would
  couple the two for no gain.
- **Read-only.** It reports; it does not repair. A script that silently writes
  production config is how a wrong expectation file becomes a wrong deployment.

### The expectation file

One machine-readable file both pieces read — proposed `deploy/railway-services.json`:

```json
{
  "projectId": "2f74ec36-d058-42fd-87b0-b4bc397dddcc",
  "environment": "production",
  "services": {
    "frontend":         { "dockerfile": "Dockerfile.frontend",         "watchPatterns": ["/frontend/**", "/shared/**", "/Dockerfile.frontend", "/tsconfig.base.json"] },
    "backend-telegram": { "dockerfile": "Dockerfile.backend-telegram", "watchPatterns": ["/backend-telegram/**", "/shared/**", "/Dockerfile.backend-telegram", "/tsconfig.base.json"] },
    "travel-agent":     { "dockerfile": "Dockerfile.backend-langgraph","watchPatterns": ["/backend-langgraph/**", "/shared/**", "/Dockerfile.backend-langgraph", "/tsconfig.base.json"] }
  }
}
```

Two details that will bite otherwise: Railway stores the patterns **with a leading
slash**, and the service deploying `backend-langgraph` is named **`travel-agent`**
— Railway named it after the repo. `pgvector` is image-sourced, has no watch
patterns, and is not listed.

`DEPLOYMENT.md`'s prose table then cites this file rather than restating it, so
there is one copy of the answer.

---

## Acceptance criteria

- [x] `deploy/railway-services.json` exists and matches the live configuration on
      the day it lands (verified by piece 2, not by reading) — `npm run
      check:railway-drift` exited 0 against production on 2026-08-31.
- [x] Deleting `/shared/**` from any service's entry turns the coverage test red.
- [x] Adding a `COPY newdir ./newdir` line to any Dockerfile turns the coverage
      test red until `newdir` is covered by that service's patterns.
- [x] A cross-workspace manifest copy (`COPY backend-telegram/package.json`) in
      `Dockerfile.frontend` does **not** demand a `/backend-telegram/**` pattern.
- [x] The root `package.json` exclusion is asserted, not incidental — both the
      exclusion list and `unwatchedByDesign` are asserted by name.
- [x] `tsconfig.base.json` has been decided about, either way, in writing —
      decided 2026-08-31: watched by all three, see above.
- [x] The drift script exits 0 when the dashboard matches the file.
- [ ] The drift script reports a hand-made dashboard change within one scheduled
      run. **Blocked on a person:** the workflow needs a `RAILWAY_TOKEN`
      repository secret (a Railway project token). Until it is added the
      scheduled job fails with exit 2 — deliberately, since a check that could
      not run is not a check that passed. The diff itself is unit-tested against
      fabricated live responses.
- [x] The drift script never writes — asserted structurally, by the absence of
      any mutation in its source with comments stripped.
- [x] `DEPLOYMENT.md` points at the file instead of duplicating the table.
- [x] `AGENTS.md` gains the rule: a new top-level directory that becomes a build
      input for more than one service needs an entry here.

## What was built

| File | What it is |
|------|-----------|
| `deploy/railway-services.json` | The expectation. Both checks read it; `DEPLOYMENT.md` cites it. |
| `deploy/coverage.mjs` | Dockerfile `COPY` lines vs. watch patterns. Pure, no network. |
| `deploy/drift.mjs` | The live query and the diff, kept separate so the diff is testable without a token. |
| `deploy/check-drift.mjs` | The CLI. Exit 0 agree, 1 drift, 2 could-not-check. |
| `deploy/*.test.mjs` | 22 tests on `node:test` — no jest, no new workspace, no dependency. |
| `.github/workflows/ci.yml` | New `deploy-config` job: checkout, node, `npm run test:deploy`. No install. |
| `.github/workflows/railway-drift.yml` | Weekly + push to `main` + manual. |

Two decisions worth recording, because both were tempting the other way.

**`node:test` rather than a fifth workspace.** Every test in this repo runs
under jest inside a package, and this one belongs to no package — it is about
the repository. A `deploy/` workspace would have meant a `package.json`, a
`tsconfig`, a `jest.config` and a CI job to carry one file's worth of logic.
Node 22 has a test runner built in, so the check has no dependencies at all and
its CI job needs no `npm ci`, which is also what makes it the fastest signal in
the pipeline.

**A missing token fails the job rather than skipping it.** The alternative —
warn and exit 0 — reproduces the exact shape of the original incident: a check
that is not running, and nobody knowing. Exit 2 is distinct from exit 1 so the
two states stay legible in the log.

## Estimate

Half a day. Actual: about that. The coverage test is an afternoon's work against files already in the
repo; the drift script is the query in this document plus a diff.

## Revisit when

- Railway's IaC `service()` gains `watchPatterns` / `dockerfilePath` — then the
  drift check becomes redundant and migrating is worth reconsidering, with the
  omit-means-delete risk weighed on its own merits.
- **Before 2026-12-01** regardless, if anyone adopts `railway.json` in the
  meantime — that is the date it stops working.

## Sources

- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) and its
  [reference](https://docs.railway.com/infrastructure-as-code/reference)
- [Config as Code](https://docs.railway.com/config-as-code) and its
  [reference](https://docs.railway.com/config-as-code/reference)
- [railwayapp/railway-ts-sdk](https://github.com/railwayapp/railway-ts-sdk)
- `railway --help`, `railway config {init,pull,plan,apply} --help` at CLI 5.23.3
