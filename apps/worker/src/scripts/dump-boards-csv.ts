import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "../supabase.js";

/** Regenerates supabase/seed/board_sources.csv from the current DB (active boards). */
async function main(): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("board_sources")
    .select("ats_type, slug, company_name")
    .eq("active", true)
    .order("ats_type", { ascending: true })
    .order("slug", { ascending: true });
  if (error) throw new Error(error.message);

  const esc = (s: string | null): string => {
    const v = s ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = ["ats_type,slug,company_name"];
  for (const r of data ?? []) lines.push(`${r.ats_type},${r.slug},${esc(r.company_name)}`);

  const path = resolve(import.meta.dirname, "../../../../supabase/seed/board_sources.csv");
  writeFileSync(path, lines.join("\n") + "\n");
  console.log(`wrote ${data?.length ?? 0} boards to ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
