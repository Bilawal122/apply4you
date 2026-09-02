# Apply4You — working context

Read this first. It is the standing orientation for anyone (human or agent)
picking the project up cold: what it is, how to run it, what is actually
deployed, and the rules that are not negotiable.

Keep it current. When production state changes, edit the "Live production
state" section in the same commit as the change.

---

## What it is

A UK-focused job application assistant. It sources listings from ATS boards
(Greenhouse, Lever, Ashby, Workable), embeds and matches them against a user's
profile, drafts an application, and — only after the user approves it —
submits it to the employer's ATS with Playwright.

Product decisions live in [DECISIONS.md](DECISIONS.md). Read D3 before
touching anything on the submission path.

## Layout

pnpm + turbo monorepo, Node **22.x**, pnpm **10.33.3**.

| Path | What |
|---|---|
| `apps/web` | Next.js 16 App Router. Vercel. The UI and the API routes. |
| `apps/worker` | BullMQ consumers + Playwright. Railway. Always-on. |
| `packages/shared` | Constants (incl. `QUEUES`), UK/location logic, types. |
| `packages/ats` | Per-ATS adapters: form parsing, filling, submission. |
| `packages/ai` | Gemini client, prompts, embeddings, deterministic resolution. |

> **`apps/web` is not the Next.js you know.** Version 16 has breaking changes:
> `proxy.ts` replaces `middleware.ts`, `app/robots.ts` and `app/sitemap.ts`
> use the MetadataRoute convention. Read `node_modules/next/dist/docs/` before
> writing code there. See `apps/web/AGENTS.md`.

## Commands

```bash
pnpm install
pnpm build        # turbo run build
pnpm typecheck
pnpm lint
pnpm test         # 208 assertions at time of writing
node scripts/check-seo-origin.mjs   # after a build; fails on a loopback origin
```

Worker operations (from `apps/worker`, need its env):

```bash
pnpm --filter @apply4you/worker preflight   # env + Redis fingerprint, no writes
pnpm --filter @apply4you/worker test-rls    # refuses non-local Supabase without --allow-remote
```

CI (`.github/workflows/ci.yml`) pins Node 22 and runs build → typecheck →
lint → test → the SEO origin guard. The build step supplies a production-like
origin on purpose: the guard reads the *prerendered bodies*, so it is only
meaningful against a realistic build.

## Live infrastructure

| | |
|---|---|
| **Railway** project | `striking-creation` · `998ef879-3f37-42a7-aafd-3ecf18008ec9` |
| — environment | `production` · `2b9c983d-6996-481e-8800-d29f4e093de5` |
| — worker service | `@apply4you/worker` · `7d929caa-f971-46bb-9973-77f2462ec5ba` |
| — Redis service | `Redis` · `ae012a96-04a0-4b8f-bc9f-39240f41e0c8` |
| — Redis public endpoint | `sakura.proxy.rlwy.net:14056` → 6379 (TCP proxy, ACTIVE) |
| **Vercel** | project `apply4you-web-one`, aliased `apply4you.vercel.app` |
| **Supabase** | project `apply4you` · `bfsiolrihzwogragktvg` (eu-west-1) |

Railway builds the worker from the **root `railway.json`**
(`builder: DOCKERFILE`, `apps/worker/Dockerfile`) — this overrides what the
dashboard displays, which has caused confusion before. The service has watch
paths: a commit touching only `apps/web` or docs is deliberately `SKIPPED`,
which is correct behaviour and not a failed deploy.

Health: `GET /api/health/queue` is public and returns **503 unless** Redis
answers *and* a worker heartbeat is fresh. It distinguishes `unreachable`
(Redis down), `no-consumer` (nothing processing), and `stale-worker-build`
(jobs active but no heartbeat → redeploy). All three stay 503 on purpose: an
endpoint that goes green on an inference is the failure it exists to prevent.

## Live production state — as of 2026-09-02 00:15 UTC

**Worker: healthy.** Running `02455e7`, deployed 2026-09-01 01:08 UTC.
Heartbeating every 60s, sourcing normally. No worker-affecting commit exists
after `02455e7`, so **a redeploy right now is a no-op** — it already carries
the heartbeat, the per-worker Redis connections and the 5-minute reconcilers.

**Open P0: `REDIS_URL` differs between Vercel and Railway.** The worker
heartbeats into the Railway `Redis` service every minute; Vercel's
`/api/health/queue` reports `worker.alive: false, lastSeen: null` because it
is reading a different instance. Both observations are correct.

Everything the *website* enqueues therefore reaches no consumer:

| Queue | Waiting | Oldest | Meaning |
|---|---|---|---|
| `resolve` | 22 | 5.8 d | apply clicks — and there are exactly 22 `draft` applications |
| `submit-workable` | 1 | 5.8 d | an approved application no employer ever received |
| `profile-embedding` | 4 | 4.0 d | those users cannot be matched at all until it runs |

**The fix** (needs dashboard access; values are redacted to OAuth callers):
set Vercel's production `REDIS_URL` to the Railway Redis service's
`REDIS_PUBLIC_URL` (the `sakura.proxy.rlwy.net:14056` proxy above), then
redeploy the web app. The worker keeps its internal hostname — private
networking is faster and free. The 22 stranded jobs are not lost by
switching: the worker's `reenqueueStrandedDrafts` sweep rebuilds them from
Postgres within five minutes.

Full history and evidence: [RETEST-2026-09-01.md](RETEST-2026-09-01.md).
Standing roadmap: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

## Rules that are not negotiable

1. **Never submit to a real employer posting.** The first live submission must
   be against a self-owned sandbox ATS board, supervised. DECISIONS.md D3,
   TESTING.md, and both audits all say this independently. It is still open —
   it is the actual launch blocker.
2. **Never auto-retry a submission that may have landed.** A row stuck in
   `submitting` is parked as `needs_manual_verification` for a human to check
   against the ATS confirmation email. Double-submitting to an employer is
   worse than not submitting.
3. **Never print secrets into a transcript** — Redis URLs, service-role keys,
   tokens. Compare fingerprints, not values.
4. **`test-rls.ts` refuses a non-local Supabase** unless `--allow-remote`.
   Leave that guard alone.
5. **Do not create a pull request unless asked.**

## Known traps, learned the hard way

- **A 200 is not a passing check.** `/robots.txt` and `/sitemap.xml` returned
  200 for weeks while telling Google to crawl `http://localhost:3000`. Assert
  on bodies. `apps/web/lib/origin.ts` is now the single origin resolver, and
  it is deliberately not derived from the `Host` header.
- **BullMQ retains completed and failed jobs.** Re-adding a deterministic
  `jobId` against a retained record is a *silent no-op*. Both producers now
  set `removeOnComplete`/`removeOnFail`, and backfills use unique ids.
- **One ioredis connection starves every worker behind it.** Workers block on
  Redis and ioredis serialises per connection, so a permanently-backlogged
  queue monopolises a shared socket. Every `Worker` gets its own connection —
  see the docblock in `apps/worker/src/queues.ts`, which records the incident.
- **A missing heartbeat has more than one cause.** Dead worker, stale build,
  or — as now — a worker heartbeating into a different Redis. Check the
  Railway deploy logs before concluding the worker is down; twice in this
  project a "dead" worker was processing hundreds of jobs a minute.
- **`turbo.json` must declare env vars the build bakes in**, or turbo replays
  a cached build made with different values and guards check stale artifacts.

## Doc map

| File | For |
|---|---|
| `DECISIONS.md` | Product decisions D1–D6. Read D3 before submission work. |
| `PRODUCTION-READINESS.md` | The standing roadmap, P0/P1/P2 with verified status. |
| `RETEST-2026-09-01.md` | Response to the 1 Sept audit; the Redis investigation. |
| `TESTING.md` | 1,103 test cases and the defects found writing them. |
| `RUNBOOK.md` | Operational procedures. |
| `DEPLOYMENT.md` | Deploy topology and environment variables. |
| `apps/web/AGENTS.md` | The Next.js 16 warning. Read before editing `apps/web`. |
