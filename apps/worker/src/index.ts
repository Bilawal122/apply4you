import { registerAllAdapters } from "@apply4you/ats";
import { registerUsageSink } from "./usage.js";
import { connection } from "./queues.js";
import { schedulePolling, startSourcingWorker } from "./processors/source-poll.js";
import { startEmbeddingWorker, startProfileEmbeddingWorker } from "./processors/embed.js";
import { scheduleNightlyMatching, startMatchingWorker } from "./processors/match.js";
import { startResolveWorker } from "./processors/resolve.js";
import { startSubmitWorkers } from "./processors/submit.js";

async function main(): Promise<void> {
  const pong = await connection.ping();
  console.log(`[worker] redis connected (${pong})`);

  registerAllAdapters();
  registerUsageSink();

  await schedulePolling();
  startSourcingWorker();
  console.log("[worker] sourcing worker started (poll-all every 2h)");

  await scheduleNightlyMatching();
  startEmbeddingWorker();
  startProfileEmbeddingWorker();
  startMatchingWorker();
  console.log("[worker] embedding + matching workers started");

  startResolveWorker();
  console.log("[worker] resolve worker started");

  startSubmitWorkers();
  console.log("[worker] submit workers started (per-ATS queues)");

  setInterval(() => {
    console.log(`[worker] heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  console.log("[worker] up");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
