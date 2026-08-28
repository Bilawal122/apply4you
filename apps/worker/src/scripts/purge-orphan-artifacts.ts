import { supabaseAdmin } from "../supabase.js";

/**
 * Removes artifact objects whose application no longer exists. Needed once
 * because account deletion historically removed only `failures/` — every
 * `confirmations/<id>.png` and `cvs/<id>.pdf` of a deleted account was
 * orphaned, and the id→user mapping died with the DB rows so the delete
 * route can never reach them retroactively. Safe to re-run any time.
 *
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/purge-orphan-artifacts.ts [--dry-run]
 */

const PREFIXES = ["failures", "confirmations", "cvs"] as const;
const PAGE = 100;

async function listAll(prefix: string): Promise<string[]> {
  const db = supabaseAdmin();
  const names: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from("artifacts").list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list artifacts/${prefix}: ${error.message}`);
    if (!data?.length) break;
    names.push(...data.map((f) => f.name));
    if (data.length < PAGE) break;
  }
  return names;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = supabaseAdmin();

  for (const prefix of PREFIXES) {
    const names = await listAll(prefix);
    if (names.length === 0) {
      console.log(`artifacts/${prefix}: empty`);
      continue;
    }

    // File names are `<applicationId>.<ext>`; anything else is left alone.
    const byId = new Map<string, string>();
    for (const name of names) {
      const id = name.replace(/\.(png|pdf)$/, "");
      if (id !== name) byId.set(id, name);
    }

    const ids = [...byId.keys()];
    const alive = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from("applications")
        .select("id")
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error(`check applications: ${error.message}`);
      for (const row of data ?? []) alive.add(row.id as string);
    }

    const orphans = ids.filter((id) => !alive.has(id)).map((id) => `${prefix}/${byId.get(id)}`);
    console.log(`artifacts/${prefix}: ${names.length} object(s), ${orphans.length} orphaned`);
    if (dryRun || orphans.length === 0) continue;

    for (let i = 0; i < orphans.length; i += PAGE) {
      const batch = orphans.slice(i, i + PAGE);
      const { error } = await db.storage.from("artifacts").remove(batch);
      if (error) throw new Error(`remove: ${error.message}`);
      console.log(`  removed ${batch.length}`);
    }
  }
  if (dryRun) console.log("dry run — nothing removed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
