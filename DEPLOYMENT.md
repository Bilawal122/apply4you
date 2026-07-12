# Deployment

Two services: the **web app** on Vercel and the **worker** on Railway. Supabase
and Upstash Redis are already provisioned.

## Web app → Vercel

Monorepo settings (Vercel auto-detects most of this):

- **Root Directory:** `apps/web`
- **Framework:** Next.js (auto-detected)
- **Build:** Vercel runs `turbo build` and infers the `@apply4you/web` filter
  from the root directory, so the `shared` and `ai` workspace packages build
  first. (Verified: a cold `turbo run build --filter=@apply4you/web` succeeds.)

Environment variables (Production):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key from Supabase → API settings) |
| `SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | (service-role key — secret) |
| `GEMINI_API_KEY` | (Google AI Studio key — secret) |
| `REDIS_URL` | (Upstash `rediss://…` TCP URL — secret) |
| `APP_URL` | the production URL, e.g. `https://<project>.vercel.app` |

After the first deploy, in the Supabase dashboard set **Authentication → URL
Configuration → Site URL** to the Vercel URL and add `<vercel-url>/auth/confirm`
to the redirect allowlist, so email confirmation and password-reset links point
at production.

## Worker → Railway

- New project from the GitHub repo. Railway reads `railway.json` at the repo
  root and builds `apps/worker/Dockerfile` (repo root is the build context; the
  Dockerfile installs the workspace deps and Chromium).
- The worker is a long-running process (no HTTP port needed) — it polls boards,
  embeds, matches, resolves, and submits.

Environment variables:

| Key | Value |
|---|---|
| `SUPABASE_URL` | https://bfsiolrihzwogragktvg.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | (service-role key — secret) |
| `GEMINI_API_KEY` | (secret) |
| `REDIS_URL` | (Upstash `rediss://…` — secret) |
| `PLAYWRIGHT_HEADLESS` | `true` |
| `WORKER_CONCURRENCY` | `2` |

board_sources is already seeded (294 boards) on the shared Supabase project, so
no seed step is needed. To reseed a fresh project:
`pnpm --filter @apply4you/worker seed:boards`.

## CI

`.github/workflows/ci.yml` exists locally but needs a `workflow`-scoped token to
push: `gh auth refresh -s workflow` then commit and push it (or paste it into the
GitHub Actions UI).
