# Production-Readiness Roadmap & TODO

*Written 2026-08-28, from the external production-readiness audit (28 Aug 2026)
cross-checked line-by-line against the actual code at HEAD. Where the audit and
the code disagree, this document says so — several audit claims were stale or
had the wrong mechanism, and one "P0" is not real. This file is the working
to-do list; [ROADMAP.md](ROADMAP.md) stays the growth/execution plan and
[DECISIONS.md](DECISIONS.md) still wins on gates.*

**Legend:** `[x]` fixed in this branch · `[ ]` open · 🧑 needs the founder's
hands/accounts · 🤖 code (agent-fixable) · 🤝 both.

---

## Executive summary (verified)

The audit's core verdict stands: **do not invite external users until the
worker runs as an always-on service and one sandbox submission passes
end-to-end.** Those two are operational (🧑) and no code change substitutes
for them. Everything else the audit raised is either fixed in this branch,
was already fixed by commits #6–#13 (the audit tested an older snapshot), or
is tracked below with acceptance criteria.

Corrections to the audit, established by reading the shipped code and the
pinned `next@16.2.10` package itself:

| Audit claim | Reality |
|---|---|
| P0-02 "`pnpm build` fails: `__dirname` undefined in ESM config" | **Not reproducible.** Next 16.2.10 swc-transpiles `next.config.ts` to CommonJS before evaluating it, so `__dirname` is defined in every supported mode. Fixed anyway (latent fragility) — but it was never a build blocker and should not gate anything. |
| P1-03 "descriptions stored raw / unnormalised at ingestion" | Ingestion **does** strip HTML — but Greenhouse returns *entity-escaped* HTML and `stripHtml` stripped tags **before** decoding entities, so the strip matched nothing and the decode pass *created* literal HTML in the DB. Same symptom, different mechanism; the fix is an ordering fix + a backfill of already-corrupted rows. |
| P1-02 "no closed-role suppression" | Vanished-job closing, closed-role purge, and closed-posting UI already exist. The **real** leak: when a board 404s or fails 3× it is set `active=false` **without closing its open jobs**, so those jobs stay matchable forever — that is how a June-2025 role reached an Aug-2026 feed. |
| P1-08 "only one real test file" | Stale — 8 real test files (~940 lines) + a CI mock-submission suite exist since commit `e964fa7`. The true remaining gaps: `apps/web` has **no test script at all** (turbo silently skips it), the worker's suite passes vacuously (`--passWithNoTests`, zero files), and the review-gate logic in `applications/actions.ts` is only tested via hand-mirrored copies that can drift. |
| "Review safety: 0-question applications" | Already fixed pre-audit-delivery by commits `2ffff3f`/`afa65b9`: unresolved applications show "still filling out", cannot be approved client- or server-side, and stranded drafts are re-enqueued at worker boot. |

---

---

## What production actually looks like right now

Measured against the live Supabase project (`bfsiolrihzwogragktvg`) on
2026-08-31. This is the state you will meet when you test:

| | before the worker was deployed | after |
|---|---|---|
| Drafts stuck with no form schema | **37**, oldest 45 days | **0** |
| Filled and awaiting your review | 18 | **32** `needs_review` + 22 `draft` |
| `failed`, each with a stated reason | 3 | 15 |
| Applications ever **submitted** | **0** | **0** — still gated on the sandbox run (P0-03) |
| Last successful board poll | 18 days ago | live, 2-hour schedule resumed |
| Boards | 410 active / 13 dead | unchanged; 119 have still never polled successfully |
| Open jobs | 26,388 — **44% over 90 days old** | unchanged |

The backlog drained completely within minutes of the worker starting. The 12
new failures are all `404` — postings that closed during the six weeks those
drafts sat unprocessed — which is the correct outcome, and each carries a
reason the user can read. (The 3 older `navigation_error` rows predate this:
applications from 3 and 7 August, from earlier submit attempts. One is the
UUID-selector `SyntaxError` that `packages/ats/test/adapters.test.ts` was
later added to guard against structurally.)

**Nothing in the "before" column was a new defect** — it was what "the worker
is off" looks like from the database. The audit's P0-01 symptom, ten
applications reading *"still filling out with 0 questions"*, is now
empirically absent: zero unfilled rows remain in `draft` or `needs_review`.

What has NOT changed: no application has ever been submitted to an employer.
That is deliberate and still gated on P0-03.

The one thing worth knowing before you test: **44% of the index is older than
90 days**, so the new freshness gate hides a lot. It was checked against real
accounts before shipping — every user still has 36–86 visible matches, well
above the 24 the feed shows, and the rest sit behind the "show older roles"
toggle rather than disappearing.

---

## P0 — must pass before any external user

### P0-01 · Queued applications are not processed (the core blocker)

The web app enqueues to Redis; the worker that consumes is an attended
process on the founder's PC ([DEPLOYMENT.md](DEPLOYMENT.md), DECISIONS D2).
With the worker off, rows sit in "still filling out" forever while
`/api/health/queue` says `ok` (it only pinged Redis).

**Code side (this branch):**
- [x] 🤖 Real worker heartbeat: the worker now writes
      `apply4you:worker:heartbeat` to Redis (60 s interval, 180 s TTL) with
      started-at/pid/queue names — not just a console line.
- [x] 🤖 `/api/health/queue` reports the truth: Redis liveness **and** worker
      liveness (heartbeat age) **and** per-queue depths (waiting/active/
      failed/delayed) **and** oldest-waiting-job age. Returns 503 when Redis
      is down **or** the heartbeat is stale, so "Redis up, worker dead" — the
      actual incident shape — is now red, not green.
- [x] 🤖 Boot-only recovery became continuous: the stuck-submission
      reconciler, approved-row re-enqueue, and stranded-draft re-enqueue now
      also run on a 5-minute interval inside the worker, not only at boot.
- [x] 🤖 Stuck-row timeout with the right recovery semantics: a draft still
      unfilled after 24 h **while a worker is alive** (i.e. re-enqueue and
      3 resolve attempts all had their chance) is failed with a reason and an
      event, on the owner's next applications-page load. Drafts waiting on a
      **down** worker are deliberately not failed — they self-heal via the
      re-enqueue the moment the worker returns, and the UI now says exactly
      that instead of "still filling out".
- [x] 🤖 Truthful UI: the applications page checks worker health server-side
      and shows an explicit banner when unresolved applications are waiting
      and the worker is offline (with last-seen time); per-card copy
      distinguishes "filling now" from "waiting for the worker (queued Xh
      ago)"; the page auto-refreshes while anything is unresolved.
- [x] 🤖 Optimistic copy corrected at the three queue-time sources ("the AI
      is filling them now" → states what is actually true given worker
      health).

- [x] 🤖 The abandonment backstop will not eat the backlog. Production
      currently holds **37 drafts with no form schema, the oldest 45 days**.
      Resolve drains at concurrency 3 under a 30/min limiter, so that
      backlog outlasts any fixed "worker has been up a while" window — and
      failing a draft is irreversible, because `resolveApplication` skips
      anything no longer in `draft`. So abandonment now additionally
      requires the resolve queue to be **completely empty**, and treats an
      unreadable depth as busy.
- [x] 🤖 `pnpm --filter @apply4you/worker preflight` — run it on the host
      before trusting it. Checks the four env vars (including that the
      Supabase key is really `service_role`, the mistake that silently
      subjects the worker to RLS), connects to Redis, writes and reads back
      a heartbeat probe, queries Supabase, confirms Chromium, and prints a
      Redis `host:port` fingerprint to compare against Vercel — the
      DEPLOYMENT.md trap where the two halves point at different instances
      and everything looks healthy while nothing is processed.
- [x] 🤖 `.github/workflows/worker-watchdog.yml` polls `/api/health/queue`
      every 15 minutes and fails (emailing you) when it is unhealthy. Needs
      no secrets — the health route is deliberately public — just the
      `APP_URL` repository variable.

**Operational side:**
- [x] 🤖 **The worker is deployed and running** (2026-08-31 23:54 UTC,
      Railway `striking-creation` → `@apply4you/worker`, from `master`
      @ `e2d570e`).

      It was never "just paused". Its last deployment **failed** on
      2026-07-15 and was never retried — `tsc` rejected five strict-TS
      index errors in `test-submit-mock.ts`. Commit `8913a11` fixed those
      weeks ago, so nothing was actually broken; the service simply sat on
      a failed build while the docs recorded a deliberate pause. Re-attaching
      the GitHub source rebuilt it from current master, which also restores
      deploy-on-push. Boot log:

      ```
      [worker] redis connected (PONG)
      [embed-job] backfilled 1000 job(s) with no embedding (54 UK)
      [worker] re-enqueued 37 stranded draft(s)
      [worker] up
      ```

      Within two minutes it had filled real applications
      (`22 fields, 17 resolved -> draft`), and `needs_review` went 18 → 24.
      Verified safe before deploying: **zero** `approved`/`submitting` rows
      existed, so nothing could reach a real employer on boot.
- [ ] 🧑 Set the `APP_URL` repository variable so the watchdog can run.
- [ ] 🧑 After merging this branch, confirm `/api/health/queue` shows
      `worker: alive` — the Redis heartbeat is **this branch's** code, so
      until it merges the running worker only logs its heartbeat to stdout
      and the new health endpoint would read `no-consumer`. Merging
      redeploys both halves together.
- [ ] 🧑 Expect a batch of resolve failures to settle as `failed`: many of
      the 37 stranded drafts point at postings that closed during the six
      weeks they sat there (`404` from Greenhouse/Lever on boot). That is
      the correct outcome, not a regression.
- [ ] 🧑 Supabase Pro (or at minimum the weekly keep-alive) before external
      users — the free-tier auto-pause has taken the site down twice.

**Acceptance:** a queued sandbox application reaches `needs_review`/`draft`
(resolved) or `failed` within the SLA you publish; stopping the worker turns
`/api/health/queue` red within 3 minutes and the applications page says so;
restart neither loses nor duplicates jobs (BullMQ + the interval reconcilers
cover this — verify once on the hosted instance).

### P0-02 · Production build — `__dirname` in `next.config.ts`

- [x] 🤖 Replaced with `fileURLToPath(import.meta.url)` (safe under both of
      Next's config-loading modes). **Verified not to be a current build
      blocker** — treat as closed hygiene, not a launch gate.
- [ ] 🧑 Optional: a clean-checkout `pnpm build` is already what CI's `check`
      job does on every PR — keep it required in branch protection.

### P0-03 · No certified end-to-end submission path

The full loop (form read → resolve → review → approve → fill → submit →
confirmation email → screenshot → events) has never run against a real
Submit button. This is deliberately gated (TESTING.md / DECISIONS D3) on a
sandbox board — the audit respected it, and so does this branch.

- [ ] 🧑 Create one dedicated sandbox board (Greenhouse trial or a $0
      Workable/Lever/Ashby board you own) with required text, textarea,
      select, radio, file, long-text, and deliberately-unanswerable fields.
- [ ] 🤝 Run the supervised loop headful against it after every
      adapter/worker change (RUNBOOK.md documents the procedure; CI's
      `submit-machinery` job already covers the mock-Greenhouse fidelity,
      confirmation branches, captcha block, and no-fabrication CV cases —
      the sandbox run is the missing *real-network* certification).
- [ ] 🤝 Record what the board received; verify the confirmation email;
      verify duplicate re-approval is refused.

**Acceptance:** one clean sandbox run end-to-end; failure/bot-wall cases
classified safely; the UI never says "sent" without an ATS confirmation or a
`needs_manual_verification` state.

---

## P1 — must pass before a public launch

### P1-01 · Sponsor semantics can imply UK eligibility for non-UK roles ✅ code fixed

Verified: the feed filter was `sponsor_verdict IS NOT NULL` (licensed-true
only by data-shape coincidence), and **job location was consulted nowhere**
in the sponsor pipeline — badge, filter, +15 ranking boost, and auto-queue
were all location-blind, so Poland/Spain roles at UK-licence multinationals
carried "licence held · skilled worker".

- [x] 🤖 Feed filter now requires `sponsor_verdict->>licensed = 'true'`
      explicitly.
- [x] 🤖 `SponsorBadge` is location-aware everywhere it renders (feed, job
      detail, dashboard, landing): provably non-UK roles show
      "UK licence · non-UK role" as a caution instead of an eligibility
      signal; unknown/remote locations keep the badge with the existing
      caveat.
- [x] 🤖 The sponsor ranking boost (`SPONSOR_BOOST`) no longer applies to
      provably non-UK roles; the needs-sponsorship auto-queue additionally
      refuses provably non-UK roles (a UK licence is irrelevant there).
- [x] 🤖 Shared tests updated to pin all of the above.
- [ ] 🧑 Later (P2): route/salary/SOC-code checks before any *stronger*
      eligibility label than "licence held" — needs the register's rated
      routes joined against role salary, which needs salary coverage first.

**Acceptance (met in code):** sponsor-filtered results contain no unlabelled
non-UK roles; a licensed employer's non-UK role is never boosted or
auto-queued as a sponsored match; the dedicated /check page semantics are
unchanged (they were already honest).

### P1-02 · Stale roles in the primary feed ✅ code fixed (one 🧑 follow-up)

- [x] 🤖 Dead-board leak closed: deactivating a board (404 / 3 consecutive
      failures) now closes its open jobs; every poll cycle also sweeps jobs
      whose board is inactive, unpolled for 7+ days, or deleted.
- [x] 🤖 Staleness demotion in shared ranking (both web and worker paths):
      roles older than 45 days (posted, falling back to first-seen) lose
      score; identical inputs still rank identically across paths.
- [x] 🤖 Default feed hides roles older than 90 days behind an explicit
      "include older roles" toggle; 45–90-day roles show a "posted Xd ago"
      stale tint. Cards without a posted date now show "first seen" instead
      of silently showing the ATS name.
- [x] 🤖 "Checked Xh ago" (board `last_polled_at`) now shows on feed cards
      and the job detail page — the freshness signal the audit asked for.
- [x] 🤖 The SQL half: `0026_match_jobs_freshness.sql` mirrors the penalty
      into `match_jobs`' `sort_score`, so stale rows also lose
      *candidate-pool* priority rather than just being reordered after the
      fact. **Applied and measured against production**, user `3a10fe56`:
      usable feed rows went 46 → 67 of 100 and stale pool entries 80 → 48,
      for a 0.4-point average relevance cost (68.4 → 68.0). Two other
      accounts landed at 86 and 71 visible. Derived from `0023` by script,
      so everything but the added `case` is byte-identical.

### P1-03 · Raw HTML in job descriptions ✅ code fixed

Real mechanism (verified by executing the shipped function): Greenhouse
returns entity-escaped HTML; `stripHtml` stripped tags before decoding, so
the decode pass *created* literal `<div><p>…` in the DB. Feed cards
coincidentally re-cleaned it, hiding the bug until the detail page.

- [x] 🤖 `stripEscapedHtml` (decode → strip) used for Greenhouse ingestion;
      Workable's literal-HTML path unchanged (its order was correct).
- [x] 🤖 `decodeEntities` hardened against out-of-range/NUL code points (the
      board-killing `RangeError` TESTING.md flags as ATS-6.1/6.2).
- [x] 🤖 Render-time defense: the job detail page now runs the description
      through a newline-preserving plain-texter, so any legacy corrupted row
      (or future ingestion regression) still renders readable text. Output
      remains React-escaped — no HTML rendering introduced, no XSS surface.
- [x] 🤖 Backfill script `apps/worker/src/scripts/fix-descriptions.ts`:
      re-cleans stored Greenhouse rows containing markup and drops their
      embeddings so the existing missing-embeddings sweep re-embeds the
      clean text (tag soup was eating the 6 000-char embedding budget).
- [x] 🤖 Tests: entities, escaped vs literal HTML, malformed tags,
      script-like content, invalid code points.
- [ ] 🧑 Run the backfill once against prod:
      `pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/scripts/fix-descriptions.ts`
      (idempotent; prints counts; add `--dry-run` first if you want).

### P1-04 · Queue health reports Redis, not worker readiness ✅ fixed
Folded into P0-01 above — heartbeat, depths, oldest-job age, 503-on-stale.

### P1-05 · robots.txt / sitemap.xml redirect to login ✅ fixed

- [x] 🤖 `app/robots.ts` (allows public pages, disallows the authed app +
      `/api/` + `/update-password`) and `app/sitemap.ts` (`/`, `/check`,
      `/privacy`, `/terms`) — both driven by `APP_URL`.
- [x] 🤖 Proxy matcher excludes both paths (also skips the Supabase
      round-trip on every crawler hit) + belt-and-braces `isPublic` entries.
- [ ] 🧑 After deploy: `curl -sI https://<prod-domain>/robots.txt` → 200
      text/plain; same for `/sitemap.xml` → 200 XML. Note `APP_URL` must be
      set on Vercel (it already is per DEPLOYMENT.md).

### P1-06 · Placeholder privacy contact ✅ code fixed (mailbox is yours)

Found in **three** places: privacy page, terms page, and — worse — the
User-Agent string every ATS sees on every poll.

- [x] 🤖 Single `SUPPORT_EMAIL` constant (env-overridable via
      `SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_EMAIL`, default
      `support@apply4you.app` — the domain already used by
      `NOTIFY_FROM_EMAIL`) now feeds all three; `.env.example` documents it.
- [ ] 🧑 **Create and monitor the mailbox** (`support@apply4you.app` or
      change the env var to one you own). A data-subject request landing in
      a dead mailbox is the compliance failure, not the string in the code.
- [ ] 🧑 Legal identity: privacy/terms still name no data controller
      (no entity/name/address). Decide what you operate as (sole trader
      name at minimum), add it to both pages, and do the ICO registration
      (ROADMAP.md item 1.7 — ~£40–60).

### P1-07 · Account deletion leaves storage behind ✅ fixed

Verified worse than the audit said: besides the unpaginated `limit: 100`
list, **two whole artifact families were never deleted** —
`confirmations/<appId>.png` and `cvs/<appId>.pdf` (the tailored CV actually
sent to employers — full PII) were orphaned forever, unrecoverable once the
DB rows cascade-deleted.

- [x] 🤖 Deletion now: paginates `resumes/<uid>/` to exhaustion; removes
      **all three** artifact families per application id (chunked); checks
      every storage/query error; **verifies zero remaining objects and
      returns 500 (retriable, account intact) before touching the auth
      user** — `deleteUser` only runs once storage is provably clean.
      Idempotent. The dead `artifacts/<uid>` list call is gone.
- [x] 🤖 Orphan sweep script for artifacts already stranded by past
      deletions: `apps/worker/src/scripts/purge-orphan-artifacts.ts`.
- [ ] 🧑 Run the orphan sweep once against prod (`--dry-run` first).
- [x] 🤖 Export now matches deletion: `/api/account/export` returns signed
      links to the tailored CVs, confirmation captures and failure
      screenshots as well as the resume. The two halves of the data-rights
      promise had disagreed — deletion removed the CV an employer actually
      received, and the export could not give it back. Ownership comes from
      the RLS-scoped query, so the admin client only ever signs the caller's
      own artifacts.

### P1-08 · Test coverage & CI ✅ largest gaps closed

- [x] 🤖 `apps/web` has a real test runner now. The review gate's pure logic
      (refusal ordering, unread-form refusal, undrivable-field refusal, the
      unresolved/needs_review computation) is extracted to
      `apps/web/lib/approval-gate.ts`, used by the server actions, and
      **tested directly**; the hand-mirrored copies in
      `packages/shared/test/unresolved-guard.test.ts` are retired. The
      worker's resolve pre-flight (demographic/unfillable parking) is
      likewise extracted to `apps/worker/src/preflight.ts` and tested.
- [x] 🤖 `apps/worker` has a real test (resolve pre-flight parking: required
      demographic parks, unfillable type parks, file fields excluded) and
      `--passWithNoTests` is gone — an empty suite now fails loudly.
- [x] 🤖 Root `pnpm test` now runs shared + ai + ats + web + worker.
      (CI already runs `pnpm test` on every PR — no workflow change needed.)
- [ ] 🤖 Later: per-ATS adapter *contract* tests beyond the structural
      selector lint (fixture forms per ATS asserting field mapping).

### P1-09 · Multi-user RLS isolation — designed, never proven

- [x] 🤖 `apps/worker/src/scripts/test-rls.ts`: a runnable two-user isolation
      suite — seeds users A and B plus a fixture application (service role),
      then asserts as A / B / anon: cross-user reads return zero rows on
      profiles, preferences, applications, events, matches, subscriptions;
      a cross-user update by direct id is a no-op; an insert impersonating
      the other user is refused; storage prefixes can't be written, read, or
      listed across users; anon reads zero rows everywhere including
      `job_embeddings`. Cleans up after itself, and refuses to run against a
      non-local Supabase without `--allow-remote`.
- [ ] 🧑 Run it against a local Supabase stack (`supabase start`, then
      `pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/scripts/test-rls.ts`)
      — this container can't run Docker, so it is written and self-checking
      but has not executed here. Then:
- [ ] 🤝 Wire it as a CI job (services: supabase CLI + docker) once it has
      passed locally — adding an unverified CI job would just turn CI red.
- [x] 🤖 Ran the Supabase security advisors against the live project.
      Eleven functions had a mutable `search_path` (lint 0011) — fixed and
      **applied** as `0025_function_search_path.sql`; all eleven now pin
      `public`, matching what `handle_new_user` / `match_jobs` already did.
      The five "RLS enabled, no policy" notices are INFO and correct as-is:
      those tables (`ai_usage`, `ats_health`, `check_rate_limit`,
      `job_embeddings`, `sponsor_staging`) are service-role-only, so no
      policy means deny-all, which is the intent.
- [ ] 🧑 Two advisor items need the dashboard, not code: enable **leaked
      password protection** (Auth → Policies) and, optionally, move the
      `vector` extension out of `public`.

### P1-10 · Structured error/empty states (audit checklist item)
- [x] Already largely present (verified: closed-posting states, enqueue-
      failure surfacing, "Nothing to review yet", session-expired handling
      from commit `d776686`). The new worker-offline banner closes the
      biggest remaining hole. No further action before launch.

### P1-11 · Alerting
- [ ] 🧑 `SENTRY_DSN` for the worker (already read by `index.ts`; a hard
      precondition of the first real submission per DECISIONS D3.8).
- [ ] 🤝 Uptime check on `/api/health/queue` (now meaningful — it goes red
      when the worker dies): any free pinger (UptimeRobot/Better Stack) at
      1–5 min interval, alert on non-200. This single check now covers
      queue lag, worker downtime, and Redis loss.
- [ ] 🤖 Later: source-poll failure-rate and sponsor-register-age metrics on
      the dashboard (data already exists in `board_sources` /
      `sponsor_register_meta`).

---

## P2 — after the core path is reliable (unchanged from audit, sequenced)

1. [ ] 🤝 **Proof layer** — publish only *earned* evidence: sandbox demo
   recording, anonymised reviewed-form examples, real dogfood counts,
   uptime/processing SLA. No invented testimonials or interview-rate claims.
2. [ ] 🤝 **Pricing page** — free 10 stays; paid quota priced on
   approved-and-sent (drafts/blocked don't consume); cancellation/refund
   policy before any charge. (ROADMAP.md Phase 4 already specs tiers.)
3. [ ] 🤖 **Immediate value before the worker wait** — the /check sponsor
   checker already exists; add CV-profile preview and "one reviewed draft"
   as the free hooks (VISION §2e instant-demo is the bigger version).
4. [ ] 🤖 **Notifications** — Resend integration exists (EMAIL.md); needs
   🧑 `RESEND_API_KEY` set in prod to actually send ready-to-review /
   failed / submitted emails.
5. [ ] 🤖 **"Why this match"** detail + stale/uncertain-data explanations on
   job cards (score breakdown already computed in `rankMatches`).
6. [ ] 🤝 **Funnel metrics** — onboarding completion, queue→review time,
   review→approval rate, submission confirmation rate, manual-fallback rate.
   (`application_events` + `review_metrics` already hold most of the raw
   data.)
7. [ ] 🤖 **Export completeness** — add tailored CVs + confirmation
   screenshots to the data export (see P1-07).
8. [ ] 🤖 **`match_jobs` staleness term** — the SQL half of P1-02.

---

## Suggested order of operations for you (the founder)

1. Merge this branch; deploy web (Vercel picks it up).
2. Create the support mailbox (or set `SUPPORT_EMAIL` env) — 10 minutes.
3. Re-enable the Railway worker; watch `/api/health/queue` go
   `worker: alive`; kill it once to see it go red. (P0-01)
4. Run the two prod one-offs: `fix-descriptions.ts`, then
   `purge-orphan-artifacts.ts` (both support `--dry-run`).
5. Sandbox board + one supervised end-to-end submission. (P0-03 — this is
   the launch gate everything else waits on.)
6. `supabase start` locally → run `scripts/test-rls.ts`; wire into CI when
   green.
7. Sentry DSN + an uptime ping on `/api/health/queue`.
8. Then the P2 list, in order.
