#!/usr/bin/env bash
#
# Bring a local Apply4You up from a fresh clone, and refuse to start on a
# half-configured environment rather than failing later in a way that looks
# like a code bug.
#
#   ./scripts/dev-up.sh          # check, install, build, test, start Redis
#   ./scripts/dev-up.sh --worker # …then run the worker in the foreground
#
set -euo pipefail
cd "$(dirname "$0")/.."

bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true)
red=$(tput setaf 1 2>/dev/null || true); grn=$(tput setaf 2 2>/dev/null || true)
ylw=$(tput setaf 3 2>/dev/null || true); off=$(tput sgr0 2>/dev/null || true)
ok(){ echo "  ${grn}✓${off} $*"; }
warn(){ echo "  ${ylw}!${off} $*"; }
die(){ echo "  ${red}✗${off} $*" >&2; exit 1; }

echo "${bold}Apply4You — local bring-up${off}"

# ── 1. toolchain ──────────────────────────────────────────────────────────
echo "${bold}1. Toolchain${off}"
command -v node >/dev/null || die "node not found — install Node 22 (nvm install 22)"
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 22 ] || die "Node $node_major found; this repo needs 22+"
ok "node $(node -v)"
command -v pnpm >/dev/null || die "pnpm not found — corepack enable && corepack prepare pnpm@10.33.3 --activate"
ok "pnpm $(pnpm -v)"

# ── 2. env ────────────────────────────────────────────────────────────────
echo "${bold}2. Environment${off}"
[ -f .env ] || { cp .env.example .env; warn ".env created from .env.example — fill it in and re-run"; exit 1; }

# Read .env WITHOUT sourcing it. A value like `Apply4You <notifications@…>` is
# perfectly valid to Node's --env-file but is shell redirection to `source`,
# which used to kill this script on line 1 of the user's own config.
envget() { sed -n "s/^[[:space:]]*$1=//p" .env | tail -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }

missing=()
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY GEMINI_API_KEY REDIS_URL; do
  [ -n "$(envget "$v")" ] || missing+=("$v")
done
REDIS_URL=$(envget REDIS_URL)
SENTRY_DSN=$(envget SENTRY_DSN)
RESEND_API_KEY=$(envget RESEND_API_KEY)
if [ ${#missing[@]} -gt 0 ]; then
  echo "  ${red}✗${off} .env is missing required values:"
  for v in "${missing[@]}"; do echo "      $v"; done
  echo "${dim}      service_role key: Supabase Dashboard → Project Settings → API${off}"
  exit 1
fi
ok "all required vars present"
[ -n "${SENTRY_DSN:-}" ] || warn "SENTRY_DSN unset — optional locally, but DECISIONS.md D3.8 makes it a"
[ -n "${SENTRY_DSN:-}" ] || echo "${dim}      hard precondition of the first real submission${off}"
[ -n "${RESEND_API_KEY:-}" ] || warn "RESEND_API_KEY unset — notifications will silently no-op"

# ── 3. redis ──────────────────────────────────────────────────────────────
echo "${bold}3. Redis${off}"
redis_host=$(printf '%s' "$REDIS_URL" | sed -E 's#^redis(s)?://([^@]*@)?([^:/]+).*#\3#')
redis_port=$(printf '%s' "$REDIS_URL" | sed -E 's#^redis(s)?://([^@]*@)?[^:/]+:?([0-9]*).*#\3#'); redis_port=${redis_port:-6379}

if command -v redis-cli >/dev/null && redis-cli -h "$redis_host" -p "$redis_port" ping >/dev/null 2>&1; then
  ok "reachable at $redis_host:$redis_port"
elif [ "$redis_host" = "localhost" ] || [ "$redis_host" = "127.0.0.1" ]; then
  if command -v redis-server >/dev/null; then
    redis-server --port "$redis_port" --daemonize yes --save '' --appendonly no
    sleep 1; ok "started local redis-server on :$redis_port"
  elif command -v docker >/dev/null; then
    docker rm -f apply4you-redis >/dev/null 2>&1 || true
    docker run -d --name apply4you-redis -p "$redis_port":6379 redis:7 >/dev/null
    sleep 2; ok "started redis:7 in docker on :$redis_port"
  else
    die "no Redis, and neither redis-server nor docker is installed"
  fi
else
  die "cannot reach Redis at $redis_host:$redis_port (remote host — check REDIS_URL)"
fi

# ── 4. build ──────────────────────────────────────────────────────────────
echo "${bold}4. Install & build${off}"
pnpm install --frozen-lockfile >/dev/null; ok "dependencies installed"
# Packages resolve each other through built dist/, and nothing watches them —
# after editing packages/*, re-run `pnpm build` or the change will not be seen.
pnpm build >/dev/null; ok "workspaces built"
pnpm typecheck >/dev/null; ok "typecheck clean"
pnpm test >/dev/null; ok "tests pass"

# ── 5. browser ────────────────────────────────────────────────────────────
echo "${bold}5. Browser${off}"
if pnpm --filter @apply4you/worker exec node -e "require('playwright').chromium.executablePath()" >/dev/null 2>&1; then
  ok "chromium present"
else
  warn "installing chromium…"; pnpm --filter @apply4you/worker exec playwright install --with-deps chromium
fi

cat <<EOF

${bold}Ready.${off}

  ${bold}web${off}     pnpm --filter @apply4you/web dev            ${dim}→ http://localhost:3000${off}
  ${bold}worker${off}  pnpm --filter @apply4you/worker exec tsx --env-file=.env src/index.ts

Useful:
  ${dim}pnpm --filter @apply4you/worker exec tsx src/scripts/test-submit-mock.ts${off}     mock submit suite
  ${dim}pnpm --filter @apply4you/worker exec tsx src/scripts/test-pollers.ts${off}         live board poll
  ${dim}pnpm --filter @apply4you/worker exec tsx src/scripts/test-forms.ts${off}           live form read
  ${dim}pnpm --filter @apply4you/worker exec tsx src/scripts/unpause-ats.ts <ats>${off}    re-arm the breaker

Next: see RUNBOOK.md for the first supervised submission (DECISIONS.md D3).
EOF

if [ "${1:-}" = "--worker" ]; then
  echo "${bold}Starting worker…${off}"
  exec pnpm --filter @apply4you/worker exec tsx --env-file=.env src/index.ts
fi
