import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "../supabase.js";

/**
 * Seeds board_sources from supabase/seed/board_sources.csv.
 * Run: pnpm --filter @apply4you/worker seed:boards
 * Slugs that 404 are deactivated automatically by the poller.
 */
async function main(): Promise<void> {
  const csvPath = resolve(import.meta.dirname, "../../../../supabase/seed/board_sources.csv");
  const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);

  const rows = lines
    .map((line) => line.split(","))
    .filter((parts): parts is [string, string, string] => parts.length >= 2)
    .map(([ats_type, slug, company_name]) => ({
      ats_type: ats_type.trim(),
      slug: slug.trim(),
      company_name: company_name?.trim() || null,
    }));

  const db = supabaseAdmin();
  const { error } = await db.from("board_sources").upsert(rows, { onConflict: "ats_type,slug", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  console.log(`Seeded ${rows.length} board sources.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
