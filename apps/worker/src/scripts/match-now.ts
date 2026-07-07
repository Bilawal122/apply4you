import { embedProfile, profileEmbeddingText } from "@apply4you/ai";
import { queues, connection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";

/** Dev utility: embed a profile inline (skipping the queue backlog) and trigger matching. */
async function main(): Promise<void> {
  const userId = process.argv[2];
  if (!userId) throw new Error("usage: tsx match-now.ts <userId>");

  const { profile, preferences } = await loadProfileAndPrefs(userId);
  const vector = await embedProfile(profileEmbeddingText(profile, preferences));
  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ embedding: JSON.stringify(vector) })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  console.log("profile embedded");

  await queues.matching.add("match-user", { userId }, { jobId: `match-manual-${Date.now()}` });
  console.log("match-user enqueued");
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
