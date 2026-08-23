# Runbook

Two procedures: getting a local Apply4You running, and executing the first
supervised real submission (the [DECISIONS.md](DECISIONS.md) D3 gate — the
thing every other phase is blocked behind).

---

## 1. Local bring-up

```bash
git clone https://github.com/Bilawal122/apply4you && cd apply4you
cp .env.example .env      # then fill it in — see below
./scripts/dev-up.sh
```

The script refuses to continue on a half-configured environment rather than
letting it fail later in a way that looks like a code bug. It checks the
toolchain, validates `.env`, starts Redis (native or Docker), installs, builds,
typechecks, tests, and ensures Chromium is present.

### What `.env` needs

| Variable | Where it comes from | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_URL` | Supabase → Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, `anon` key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` — **bypasses RLS, never ships to the browser** | yes |
| `GEMINI_API_KEY` | aistudio.google.com | yes |
| `REDIS_URL` | `redis://localhost:6379` locally; the Railway service in production (D2) | yes |
| `SENTRY_DSN` | sentry.io | optional locally, **required before any real submission** (D3.8) |
| `RESEND_API_KEY` | resend.com | optional — `notify.ts` silently no-ops without it |
| `DATABASE_URL` | Supabase → Database → Connection string | only for `npx supabase db push` |

`WORKER_CONCURRENCY` appears in `.env.example` but is never read — every
processor hardcodes its own concurrency in `startWorker()`.

### Running it

```bash
pnpm --filter @apply4you/web dev                                        # :3000
pnpm --filter @apply4you/worker exec tsx --env-file=.env src/index.ts   # worker
```

Per D2 the worker runs **attended, on your own machine** during dogfood: a
residential IP keeps bot-detection risk representative, and you watch the logs
of every first real submission live.

### The one thing that will bite you

Packages resolve each other through built `dist/`, and **nothing watches them**.
After editing anything under `packages/`, run `pnpm build` — otherwise the dev
server and the worker keep running the previous version. There are no
TypeScript project references and no `transpilePackages`.

---

## 2. The first supervised submission (D3 gate)

The gate has two acceptable exits. Either clears it.

- **Exit A** — a `$0` Workable trial board you own. Live submit, duplicate
  refused, captcha records as failed. No real employer involved.
- **Exit B** — one genuinely low-stakes Greenhouse posting you would have
  applied to anyway. Every field reviewed, headful, screen-recorded, verified
  by the confirmation email.

Exit B is also your hero video. Do not skip the recording.

### Before you start — preconditions

- [ ] Sentry live on the worker (`SENTRY_DSN` set) — D3.8
- [ ] Company blocklist seeded with your out-of-tool applications — D3.1
- [ ] Your CV uploaded to your **real** account (`resume_storage_path` set)
- [ ] `PLAYWRIGHT_HEADLESS=false` — you must watch it happen
- [ ] Screen recording running

### The run

1. **Queue one job.** Pick it yourself from the feed; don't bulk-queue.
2. **Wait for `status = draft`.** If it sits in `draft` with `form_schema`
   empty and no cover letter, resolution failed — check the worker log and the
   `application_events` trail.
3. **Read every field in the review packet.** Specifically:
   - Anything labelled **"source not recorded"** — the machine cannot vouch for
     who wrote it. Verify it yourself.
   - Every **right-to-work / sponsorship** question. These now park by design:
     the résumé parser never populates `workAuthorization`, because CVs don't
     state immigration status. Answer them in the Answer Library
     (`/preferences` → Right to work) and they will be reused, in your own
     words, on every future form.
   - The **tailored CV** — open the full document, not the summary. It is the
     exact file that gets uploaded.
4. **Approve.** Watch the browser fill the real form.
5. **Verify the confirmation email** actually arrived from the employer.
6. **Immediately test the duplicate guard**: re-approve the same application.
   It must be refused (`already submitted` / `already claimed`) in the log.

### If it fails

| Symptom | Meaning | Action |
|---|---|---|
| `captcha` / `bot_wall` | Detected and recorded, never bypassed | Apply manually via the posting link. Three in a row trips the breaker |
| `posting_closed` | Staleness guard fired at submit time | Nothing to do — the posting died between queue and submit |
| `form_error` | The employer's own validation rejected it | Read the screenshot in `artifacts/failures/`. Usually a required field left empty |
| `confirmation_timeout` | Submit clicked, no confirmation seen | **Check manually before retrying** — it may have gone through. The click is never blind-retried |
| `navigation_error` | The page or a control misbehaved | Screenshot in `artifacts/failures/` |

The circuit breaker pauses an ATS after 3 consecutive captcha/bot-wall
failures, for every user. Re-arm it deliberately:

```bash
pnpm --filter @apply4you/worker exec tsx src/scripts/unpause-ats.ts greenhouse --requeue
```

### After it passes

Record the dogfood start date in [ROADMAP.md](ROADMAP.md). The two-week D1
clock and everything in Phase 1 run from that date.

---

## 3. Useful scripts

```bash
# validation
pnpm --filter @apply4you/worker exec tsx src/scripts/test-submit-mock.ts     # full submit machinery vs a mock ATS
pnpm --filter @apply4you/worker exec tsx src/scripts/verify-tailored-cv.ts   # no-fabrication + renders a PDF
pnpm --filter @apply4you/worker exec tsx src/scripts/test-pollers.ts         # live board poll (read-only)
pnpm --filter @apply4you/worker exec tsx src/scripts/test-forms.ts           # live form read (read-only)

# operations
pnpm --filter @apply4you/worker exec tsx src/scripts/unpause-ats.ts <ats>    # re-arm the circuit breaker
pnpm --filter @apply4you/worker exec tsx src/scripts/poll-now.ts             # force a poll cycle
pnpm --filter @apply4you/worker exec tsx src/scripts/match-now.ts            # force a match run
pnpm --filter @apply4you/worker exec tsx src/scripts/seed-boards.ts          # load board_sources from CSV

# reporting
pnpm --filter @apply4you/worker exec tsx src/scripts/ai-cost-report.ts       # cost per application
pnpm --filter @apply4you/worker exec tsx src/scripts/ats-metrics-report.ts   # per-ATS success rate
pnpm --filter @apply4you/worker exec tsx src/scripts/check-review-metrics.ts # D6 review-quality gate
```

**Never run a submission test against a real company's posting** outside the
supervised procedure above. Use your own trial board.
