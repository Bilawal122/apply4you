# Apply4You

AI job-application service: upload a resume once, get matched to jobs from Greenhouse / Lever / Ashby / Workable public boards, and let AI fill out applications — you review and approve, headless workers submit. Spec: [AutoApply-PRD-buildspec.md](AutoApply-PRD-buildspec.md).

## Architecture

| Piece | Where | What |
|---|---|---|
| `apps/web` | Vercel | Next.js 16 App Router — auth, onboarding, feed, review UI, dashboard |
| `apps/worker` | Railway/Render (Docker) | BullMQ processors: sourcing, embedding, matching, resolution, Playwright submission |
| `packages/shared` | — | Zod schemas (single source of truth) + constants |
| `packages/ats` | — | Per-ATS adapters: poll, read form, fill, submit, detect blocks |
| `packages/ai` | — | Gemini client: resume parse, embeddings, field resolution, cover letters |
| Supabase | cloud | Postgres + pgvector, Auth, Storage (resumes, artifacts), Realtime |
| Redis | Railway/Upstash | BullMQ queues |

## Setup

### 1. Supabase
1. Create a project at database.new (region near you).
2. `npx supabase login`, then `npx supabase link --project-ref <ref>` from the repo root.
3. Apply migrations: `npx supabase db push` (creates schema, RLS, buckets, triggers).
4. From Project Settings → API: copy the URL, anon key, and service-role key into `.env` (see `.env.example`).

### 2. Gemini
Create an API key at aistudio.google.com and set `GEMINI_API_KEY`.

### 3. Redis
Local dev: any Redis (e.g. Memurai on Windows, or Docker `redis:7`). Set `REDIS_URL`.

### 4. Install & run
```bash
pnpm install
pnpm build
pnpm --filter @apply4you/worker seed:boards   # load the starter board list
pnpm --filter @apply4you/web dev              # web on :3000
pnpm --filter @apply4you/worker dev           # worker (polls boards on startup schedule)
```

To force an immediate poll cycle rather than waiting for the 2h schedule, temporarily change the cron pattern in `apps/worker/src/processors/source-poll.ts` or add a one-off `poll-all` job.

### 5. Deploy
- **Web → Vercel**: import repo, framework Next.js, root directory `apps/web`. Set env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `REDIS_URL`).
- **Worker → Railway**: new service from repo, Dockerfile path `apps/worker/Dockerfile`. Add a Redis service and set `REDIS_URL`, plus `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

## The pipeline

```
board_sources ──poll (2h)──> jobs ──embed──> pgvector
profile save ──embed──> match_jobs() ──> job_matches ──> /feed
user queues job ──> applications(draft) ──resolve──> AI-filled draft
user approves ──> submit queue ──Playwright──> submitted / failed
                                            └──> application_events ──Realtime──> live feed
```

## Guardrails (non-negotiable, from the PRD)

- **No fabrication**: any field without a profile-backed value resolves to `null` and is surfaced as needing the user's answer. Selects are post-validated against the actual option list.
- **Review gate**: nothing submits without explicit approval (`auto_submit` exists in the schema but is off and hidden).
- **Caps**: per-user daily cap and plan limit enforced at approval AND atomically at submission.
- **CAPTCHA / bot walls**: detected → recorded as `failed` with a screenshot → user gets an "apply manually" link. Never bypassed.
- **No LinkedIn/Indeed** submission or credentials, ever.
- **EEOC/demographic questions** are never answered on the user's behalf.
- Data export (`/api/account/export`) and hard delete (`/api/account/delete`).

## Testing

```bash
pnpm --filter @apply4you/ai test                       # guardrail unit tests
pnpm --filter @apply4you/worker exec tsx src/scripts/test-pollers.ts   # live poller check
pnpm --filter @apply4you/worker exec tsx src/scripts/test-forms.ts     # live form-reader check
```

**End-to-end submission testing**: create your own free sandbox job board (Greenhouse or Ashby trial / Lever sandbox) with custom questions and run the full loop against it. **Never test submissions against real companies' postings.**

## Known limitations / next steps

- Workable sits behind Cloudflare; expect a lower submit success rate (blocks are recorded as failed).
- Stripe billing is deferred — `subscriptions` table is metered but everything runs on the free plan defaults.
- Browser extension (Assisted mode) is deferred; this is the Auto-mode-first build.
- Greenhouse selects submit numeric ids under the hood; the fill layer picks by visible label, which handles this, but exotic custom widgets may need per-board fixes.
- The seed board list (`supabase/seed/board_sources.csv`) is a starter set — dead slugs deactivate automatically; add more via CSV + `seed:boards`.
