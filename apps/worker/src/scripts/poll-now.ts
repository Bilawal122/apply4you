import { queues, connection } from "../queues.js";

/** Dev utility: trigger one immediate poll-all cycle instead of waiting for the 2h schedule. */
async function main(): Promise<void> {
  const job = await queues.sourcing.add("poll-all", {}, { jobId: `poll-all-manual-${Date.now()}` });
  console.log(`enqueued ${job.id}`);
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
