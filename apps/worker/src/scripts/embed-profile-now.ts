import { queues, connection } from "../queues.js";

/** Dev utility: enqueue an embed-profile (which chains into match-user) for a user id. */
async function main(): Promise<void> {
  const userId = process.argv[2];
  if (!userId) throw new Error("usage: tsx embed-profile-now.ts <userId>");
  const job = await queues.embedding.add("embed-profile", { userId }, { jobId: `embed-profile-manual-${Date.now()}` });
  console.log(`enqueued ${job.id}`);
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
