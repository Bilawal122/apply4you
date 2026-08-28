import { stripHtml } from "@apply4you/ats";
import { supabaseAdmin } from "../supabase.js";

/**
 * One-off repair for Greenhouse descriptions stored as raw HTML. Greenhouse
 * serves entity-escaped HTML; stripHtml used to strip tags BEFORE decoding
 * entities, so the strip matched nothing and the decode pass materialised
 * literal tags into the stored text. Ingestion is fixed (stripEscapedHtml),
 * but source-poll's unchanged-comparison deliberately never rewrites
 * description, so existing rows stay corrupted until this runs.
 *
 * For each affected row: re-clean the text (stripHtml works now — the tags
 * are literal) and drop its job_embeddings row so the standing
 * missing-embeddings sweep re-embeds the clean text on the next poll cycle
 * (tag soup was eating the 6,000-char embedding budget). Idempotent.
 *
 * Run: pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/scripts/fix-descriptions.ts [--dry-run]
 */

const PAGE = 500;
// A literal tag, not a stray "<" in prose ("salary < 40k").
const TAG = /<\/?[a-z][^>]*>/i;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = supabaseAdmin();

  let scanned = 0;
  let repaired = 0;
  // Keyset pagination — repairs shrink the filtered set mid-scan, so an
  // offset would skip rows.
  let lastId = "";
  for (;;) {
    let query = db
      .from("jobs")
      .select("id, description")
      .eq("ats_type", "greenhouse")
      .like("description", "%<%")
      .order("id")
      .limit(PAGE);
    if (lastId) query = query.gt("id", lastId);
    const { data: rows, error } = await query;
    if (error) throw new Error(`select jobs: ${error.message}`);
    if (!rows?.length) break;
    scanned += rows.length;
    lastId = rows[rows.length - 1]!.id as string;

    for (const row of rows) {
      const description = row.description as string | null;
      if (!description || !TAG.test(description)) continue;
      const cleaned = stripHtml(description);
      if (cleaned === description) continue;
      repaired += 1;
      if (dryRun) continue;

      const { error: updateError } = await db
        .from("jobs")
        .update({ description: cleaned })
        .eq("id", row.id);
      if (updateError) throw new Error(`update ${row.id}: ${updateError.message}`);

      // Deleted, not re-upserted: the missing-embeddings sweep (embed.ts,
      // runs at boot + every poll cycle) picks the row up and re-embeds.
      const { error: embError } = await db.from("job_embeddings").delete().eq("job_id", row.id);
      if (embError) throw new Error(`drop embedding ${row.id}: ${embError.message}`);
    }
    if (rows.length < PAGE) break;
  }

  console.log(
    `${scanned} greenhouse row(s) containing "<" scanned; ${repaired} ${dryRun ? "would be" : ""} repaired${dryRun ? " (dry run)" : " and queued for re-embedding on the next poll cycle"}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
