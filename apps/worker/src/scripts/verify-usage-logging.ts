import { embedJob } from "@apply4you/ai";
import { supabaseAdmin } from "../supabase.js";
import { registerUsageSink } from "../usage.js";

/** Verifies the usage sink actually writes an ai_usage row for a real AI call. */
async function main(): Promise<void> {
  const db = supabaseAdmin();
  const { count: before } = await db.from("ai_usage").select("id", { count: "exact", head: true });

  registerUsageSink();
  await embedJob("Verification embedding for usage logging test.");
  // The sink insert is fire-and-forget; give it a moment to land.
  await new Promise((r) => setTimeout(r, 2500));

  const { count: after } = await db.from("ai_usage").select("id", { count: "exact", head: true });
  const { data: latest } = await db
    .from("ai_usage")
    .select("operation, model, input_tokens, estimated_cost_usd, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  console.log(`ai_usage rows: ${before ?? 0} -> ${after ?? 0}`);
  console.log("latest row:", JSON.stringify(latest?.[0]));
  if ((after ?? 0) > (before ?? 0)) {
    console.log("PASS: usage logging works end-to-end");
    process.exit(0);
  }
  console.log("FAIL: no new ai_usage row");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
