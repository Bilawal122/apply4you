import type { Worker } from "bullmq";
import { registerAllAdapters } from "@apply4you/ats";
import { registerUsageSink } from "./usage.js";
import { connection } from "./queues.js";
import { schedulePolling, startSourcingWorker } from "./processors/source-poll.js";
import { startEmbeddingWorker, startProfileEmbeddingWorker } from "./processors/embed.js";
import { scheduleNightlyMatching, startMatchingWorker } from "./processors/match.js";
import { startResolveWorker } from "./processors/resolve.js";
import { startSubmitWorkers } from "./processors/submit.js";

/**
 * Job failures are otherwise invisible (BullMQ retains them silently) — the
 * match_jobs statement-timeout regression went unnoticed for days this way.
 */
function logFailures(...workers: Worker[]): void {
  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(`[${worker.name}] job ${job?.id ?? "?"} (${job?.name ?? "?"}) FAILED: ${String(err?.message ?? err).slice(0, 300)}`);
    });
    worker.on("error", (err) => {
      console.error(`[${worker.name}] worker error: ${String(err?.message ?? err).slice(0, 300)}`);
    });
  }
}

async function main(): Promise<void> {
  const pong = await connection.ping();
  console.log(`[worker] redis connected (${pong})`);

  registerAllAdapters();
  registerUsageSink();

  await schedulePolling();
  const sourcing = startSourcingWorker();
  console.log("[worker] sourcing worker started (poll-all every 2h)");

  await scheduleNightlyMatching();
  const embedding = startEmbeddingWorker();
  const profileEmbedding = startProfileEmbeddingWorker();
  const matching = startMatchingWorker();
  console.log("[worker] embedding + matching workers started");

  const resolve = startResolveWorker();
  console.log("[worker] resolve worker started");

  const submits = startSubmitWorkers();
  console.log("[worker] submit workers started (per-ATS queues)");

  logFailures(sourcing, embedding, profileEmbedding, matching, resolve, ...submits);

  setInterval(() => {
    console.log(`[worker] heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  console.log("[worker] up");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
