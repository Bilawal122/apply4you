import { queues, connection } from "../queues.js";

/** Dev utility: enqueue resolution for an application id. */
async function main(): Promise<void> {
  const applicationId = process.argv[2];
  if (!applicationId) throw new Error("usage: tsx resolve-now.ts <applicationId>");
  const job = await queues.resolve.add("resolve-application", { applicationId }, { jobId: `resolve-${applicationId}` });
  console.log(`enqueued ${job.id}`);
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
