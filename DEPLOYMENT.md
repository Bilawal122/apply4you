# Deployment

Two services: the **web app** on Vercel (already live) and the **worker** on
Railway (not yet deployed — this is the one thing that makes the auto-apply loop
run). Supabase and Upstash Redis are already provisioned.

The web app only *produces* jobs onto Redis; the worker is the *consumer* that
resolves, submits, and re-polls. Nothing a user queues is processed until the
worker runs 24/7, so both halves must point at the **same** Upstash instance.

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
| `REDIS_URL` | (Upstash `rediss://…` URL — secret) | **see trap #1** |
| `APP_URL` | `https://apply4you-web-one.vercel.app` | **see trap #2 — no trailing slash** |

**Trap #1 — `REDIS_URL` must be set on the *web* app.** The web app enqueues
straight to Redis (no HTTP to the worker). If it's missing, ioredis silently
falls back to `localhost:6379`, the connection fails, and every *Queue* / *Approve*
click creates a draft row while enqueuing **nothing** — the UI looks like it
worked. Use the exact same value as the worker.

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

## Worker → Railway (the missing piece)

New Railway project from the GitHub repo. Railway reads `railway.json` at the repo
root and builds `apps/worker/Dockerfile` (repo root is the build context; the
Dockerfile installs the workspace deps + Chromium). It's a long-running background
process with **no HTTP port** — ignore any Railway "no exposed ports" notice; it
does not need a public domain.

**Sizing:** pick a plan with **≥ 1 GB RAM** — each submission spins up a headless
Chromium context.

### Required environment variables (exactly these four)

The worker reads only `process.env` — the repo `.env` is **not** baked into the
image, so every value must be set in Railway's Variables tab:

| Key | Value |
|---|---|
| `REDIS_URL` | the Upstash `rediss://…` URL — the **same** instance the web app uses |
| `SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role JWT (secret — **not** the anon key) |
| `GEMINI_API_KEY` | Google AI Studio key |

`PLAYWRIGHT_HEADLESS` and `WORKER_CONCURRENCY` appear in `.env` but the worker
does **not** read them — leave them unset (it defaults to headless, which is what
a server wants).

### Upstash Redis — two settings that will bite otherwise

- **Eviction policy = `noeviction`.** BullMQ requires it; Upstash's default
  eviction can silently drop queue keys and corrupt job state.
- **Command quota.** A 24/7 worker with blocking polls across ~9 queues + a 60s
  heartbeat burns commands fast — the Upstash **free tier (500K cmds/mo) will run
  out in days**. Move that Redis DB to a paid/pay-as-you-go tier before relying on
  the worker continuously, or it will stop mid-day.

### Confirm a healthy boot

Railway logs should show, in order:

```
[worker] redis connected (PONG)
[worker] sourcing worker started (poll-all every 2h)
[worker] embedding + matching workers started
[worker] resolve worker started
[worker] submit workers started (per-ATS queues)
[worker] up
[worker] heartbeat <timestamp>      ← every 60s thereafter
```

Once it's up, the every-2h poll scheduler self-registers, so sourcing (currently
4 days stale) refreshes automatically and re-queued applications drain within a
minute.

---

## After the worker is live — before enabling real submissions

1. **Upload a résumé through the app.** The `resumes` storage bucket is currently
   empty (0 files); `submit.ts` hard-fails with `no_resume` before Playwright ever
   opens a form, so no application can submit until a real résumé is stored and
   `profiles.resume_storage_path` is set.
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
