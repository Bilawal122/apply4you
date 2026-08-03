import { refreshSponsorRegister } from "../processors/sponsor-register.js";

/** One-off / manual sponsor-register ingest (the worker also runs this weekly).
 *  Run: pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/scripts/seed-sponsors.ts */
refreshSponsorRegister()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
