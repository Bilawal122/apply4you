import { supabaseAdmin } from "../supabase.js";
import { queues, connection } from "../queues.js";

/** Dev utility: reset an application to draft and re-enqueue resolution. */
async function main(): Promise<void> {
  const applicationId = process.argv[2] ?? "93fd3d71-1e27-4cf3-87e5-4c76e285d89d";
  const db = supabaseAdmin();
  await db
    .from("applications")
    .update({ status: "draft", resolved_fields: {}, form_schema: null, unresolved_fields: [], cover_letter: null })
    .eq("id", applicationId);
  await queues.resolve.add("resolve-application", { applicationId }, { jobId: `resolve-${applicationId}-${Date.now()}` });
  console.log(`reset + re-enqueued ${applicationId}`);
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
