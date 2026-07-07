# Version-agnostic: installs the Chromium matching the installed playwright package.
FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ats/package.json packages/ats/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN pnpm install --frozen-lockfile --filter @apply4you/worker...
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm --filter @apply4you/worker... build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
# Chromium + OS deps for headless submission
RUN cd apps/worker && npx playwright install --with-deps chromium
WORKDIR /repo/apps/worker
CMD ["node", "dist/index.js"]
