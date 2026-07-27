# Deployment

> **INCIDENT RUNBOOK — Supabase free-tier auto-pause (first hit 2026-07-25).**
> The free tier pauses a project after ~7 idle days. Symptoms: every REST/auth
> request returns **503**, `get_project` may still claim `ACTIVE_HEALTHY`
> (stale), no postgres logs. The production site is fully down while paused.
> Recovery, in order:
> 1. Any management-API touch (or dashboard visit) triggers auto-restore —
>    usually recovers in ~2-5 minutes.
> 2. If still 503 after ~10 min the restore is wedged: dashboard →
>    project → Settings → General → **Restart project** (requires dashboard
>    login — sessions expire, expect to re-auth with GitHub).
> 3. Still down 30+ min after that: open a ticket at
>    https://app.supabase.com/support/new (they state the 30-min line).
>
> Prevention while on the free tier: any DB activity resets the 7-day clock.
> A weekly keep-alive (one SELECT via a scheduled GitHub Action or cron) is
> enough; the real fix is Supabase Pro ($25/mo) — per DECISIONS.md D2 that
> waits until external users exist.

Two services: the **web app** on Vercel (already live) and the **worker**,
which per DECISIONS.md D2 runs **attended on the founder's own PC** during the
dogfood phase (not hosted 24/7). Supabase and Redis (Railway, see below) are
already provisioned.

The web app only *produces* jobs onto Redis; the worker is the *consumer* that
resolves, submits, and re-polls. Nothing a user queues is processed until the
worker runs, so both halves must point at the **same** Redis instance.

## Redis: Railway (flat-rate), replacing Upstash (2026-07-27)

Upstash's pay-per-command billing charged for every idle BullMQ poll — it hit
$6 in 2 days once, then ~8 days of an orphaned local worker process ran the
bill up further before being caught. Redis now lives as a **Railway service**
in the `striking-creation` project (flat Hobby-plan pricing, no per-command
charge), reachable from outside Railway via its **public TCP proxy** endpoint
(`REDIS_PUBLIC_URL` in that service's Variables tab — the private
`REDIS_URL`/`railway.internal` host only works for other services *inside* the
same Railway project, not from Vercel or a local machine).

Both the web app (Vercel) and the local worker's `.env` now point at that
public URL. **The old Upstash `REDIS_URL` still exists but nothing uses it —
its pay-per-command plan charges ~$0 while idle, so there is no urgency, but
it can be deleted whenever convenient:** log into
[console.upstash.com](https://console.upstash.com) (Continue with Google) →
open the `dynamic-finch-158539` database → Delete.

If the Railway Redis service is ever recreated, its connection variables
regenerate — re-copy the new `REDIS_PUBLIC_URL` into both `.env` files and the
Vercel `REDIS_URL` env var (see the Vercel section below), then redeploy.

---

## Web app → Vercel (live at https://apply4you-web-one.vercel.app)

Monorepo settings:

- **Root Directory:** `apps/web` (required — this is how `apps/web/vercel.json`
  and its `cd ../.. && pnpm turbo …` install/build commands are picked up).
- **Framework:** Next.js (auto-detected).

Environment variables (Production scope), then **redeploy** — Vercel does not
hot-reload env into existing deployments:

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co | baked in at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon/publishable key) | baked in at build time |
| `SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co | |
| `SUPABASE_SERVICE_ROLE_KEY` | (service-role key — secret) | admin actions throw without it |
| `GEMINI_API_KEY` | (Google AI Studio key — secret) | résumé parse runs in the web request path |
| `REDIS_URL` | Railway Redis **public proxy** URL (`redis://default:…@<host>.proxy.rlwy.net:<port>`) — secret | **see trap #1** |
| `APP_URL` | `https://apply4you-web-one.vercel.app` | **see trap #2 — no trailing slash** |

**Trap #1 — `REDIS_URL` must be set on the *web* app.** The web app enqueues
straight to Redis (no HTTP to the worker). If it's missing, ioredis silently
falls back to `localhost:6379`, the connection fails, and every *Queue* / *Approve*
click creates a draft row while enqueuing **nothing** — the UI looks like it
worked. Use the exact same value as the worker (Vercel's env-var editor shows a
greyed placeholder for masked values — click into the field and select-all
before typing, or a stray character from the placeholder can leak into the
saved value).

**Trap #2 — `APP_URL` must be the production domain, not `localhost`.** The local
`.env` has `APP_URL=http://localhost:3000`; if that's copied to Vercel, every
password-reset email links to the user's own machine. This is the one variable
that must differ between local and prod.

**Supabase Auth URLs** (dashboard → project `bfsiolrihzwogragktvg` → Authentication
→ URL Configuration): Site URL = `https://apply4you-web-one.vercel.app`, and add
`https://apply4you-web-one.vercel.app/**` to the redirect allowlist. (Already set
in a prior session — verify it's still there so signup-confirmation and
password-reset links resolve to prod.)

**Local dev signups:** signup/reset emails redirect to `APP_URL`, and Supabase
silently falls back to the prod Site URL for any origin not on the allowlist —
so to test the signup → onboarding flow locally, also add
`http://localhost:3000/**` to the redirect allowlist.

---

## Worker → attended locally during dogfood (Railway hosting deliberately paused)

> **STATUS 2026-07-27** (DECISIONS.md D2): the worker runs **on the founder's
> own PC, on demand**, not 24/7 on Railway — $0 marginal cost, a residential IP
> for the first real submissions, and live log-watching. A Railway deployment
> of `@apply4you/worker` still exists in the project but its **auto-deploy is
> disabled** (git pushes will NOT restart it) and no active deployment is
> running. Re-enabling 24/7 hosting is a later step, gated on the friends
> launch in D6 — flip auto-deploy back on in Settings → Source when that day
> comes; the four env vars below are unchanged either way.
>
> **Run it locally:** `pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/index.ts`
> from the repo root. **Stop it by killing the actual process tree**, not just
> the wrapping shell — `pnpm exec tsx` spawns child processes, and a partial
> kill leaves an orphaned worker silently burning Redis/Supabase calls in the
> background (this happened once: ~8 days undetected). Verify nothing is left
> with `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and confirm
> no `tsx`/`src/index` command lines remain.

If/when it moves back to Railway: `railway.json` at the repo root points at
`apps/worker/Dockerfile` (repo root is the build context; the Dockerfile
installs the workspace deps + Chromium). It's a long-running background
process with **no HTTP port** — ignore any Railway "no exposed ports" notice.
**Sizing:** pick a plan with **≥ 1 GB RAM** — each submission spins up a
headless Chromium context.

### Required environment variables (exactly these four)

The worker reads only `process.env` — the repo `.env` is **not** baked into a
Railway image, so on Railway every value must be set in that service's
Variables tab (locally, `.env` covers it):

| Key | Value |
|---|---|
| `REDIS_URL` | Railway Redis **public proxy** URL — the **same** instance the web app uses (see the Redis section above) |
| `SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role JWT (secret — **not** the anon key) |
| `GEMINI_API_KEY` | Google AI Studio key |

`PLAYWRIGHT_HEADLESS` and `WORKER_CONCURRENCY` appear in `.env` but the worker
does **not** read them — leave them unset (it defaults to headless, which is what
a server wants; running locally with a visible browser needs a code change,
not this env var).

### Confirm a healthy boot

Logs should show, in order:

```
[worker] redis connected (PONG)
[worker] sourcing worker started (poll-all every 2h)
[worker] embedding + matching workers started
[worker] resolve worker started
[worker] submit workers started (per-ATS queues)
[worker] up
[worker] heartbeat <timestamp>      ← every 60s thereafter
```

Once it's up, the every-2h poll scheduler self-registers (idempotent — safe to
start/stop the worker repeatedly), so sourcing refreshes automatically and
re-queued applications drain within a minute of being run.

---

## After the worker is live — before enabling real submissions

1. **Upload a résumé for the account you're actually using.** `submit.ts`
   hard-fails with `no_resume` before Playwright ever opens a form if
   `profiles.resume_storage_path` is unset for that user — check per-account,
   don't assume from a different test account.
2. **Validate one submission on a self-owned Greenhouse sandbox board** (task #15).
   The submit path has never clicked a real submit button. Seed a `board_source` +
   `job` + `approved` application pointing at your sandbox, run the worker with
   `PLAYWRIGHT_HEADLESS=false` to watch it reach `status=submitted`, then confirm a
   second submit is refused. Keep real employer submissions review-only and the
   full-auto toggle **off** until this passes.

board_sources is already seeded (~300 boards) on the shared Supabase project, so
no seed step is needed. To reseed a fresh project:
`pnpm --filter @apply4you/worker seed:boards`.

## CI

`.github/workflows/ci.yml` exists locally but needs a `workflow`-scoped token to
push: `gh auth refresh -s workflow` then commit and push it (or paste it into the
GitHub Actions UI).
