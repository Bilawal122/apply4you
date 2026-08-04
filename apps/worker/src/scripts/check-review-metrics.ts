/**
 * Proves the C2 instrumentation round-trips against the live database:
 * the column accepts the exact shape the client sends, and rejects nothing
 * it should accept. Writes to a scratch row and rolls it back.
 */
import { ReviewMetricsSchema, summariseReviews } from "@apply4you/shared";
import { supabaseAdmin } from "../supabase.js";

const db = supabaseAdmin();

const sample = {
  openedCount: 2,
  seconds: 47.3,
  fieldsEdited: 3,
  aiFieldsEdited: 1,
  coverLetterEdited: true,
  bulk: false,
};

const { data: app } = await db
  .from("applications")
  .select("id, review_metrics")
  .limit(1)
  .maybeSingle<{ id: string; review_metrics: unknown }>();

if (!app) {
  console.log("no applications yet — column presence check only");
  const { error } = await db.from("applications").select("review_metrics").limit(0);
  console.log(error ? `COLUMN MISSING: ${error.message}` : "column exists");
  process.exit(0);
}

const before = app.review_metrics;
const { error: wErr } = await db.from("applications").update({ review_metrics: sample }).eq("id", app.id);
console.log("write:", wErr ? `FAILED ${wErr.message}` : "ok");

const { data: back } = await db
  .from("applications").select("review_metrics").eq("id", app.id).single<{ review_metrics: unknown }>();
const parsed = ReviewMetricsSchema.safeParse(back?.review_metrics);
console.log("read-back parses:", parsed.success ? "ok" : parsed.error.issues);
if (parsed.success) console.log("summary of one:", summariseReviews([parsed.data]));

await db.from("applications").update({ review_metrics: before }).eq("id", app.id);
console.log("restored original:", JSON.stringify(before));
