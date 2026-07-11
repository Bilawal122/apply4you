import { readFileSync } from "node:fs";
import type { AtsType } from "@apply4you/shared";
import { getAdapter, registerAllAdapters, AtsHttpError } from "@apply4you/ats";
import { supabaseAdmin } from "../supabase.js";

/**
 * Validates candidate board slugs against the live ATS APIs and seeds the ones
 * that return jobs. Input: a JSON file of {ats, slug, company}[] (arg 1).
 * Only boards that currently return >=1 posting are inserted — dead/typo slugs
 * are dropped rather than left for the poller to deactivate later.
 *
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/validate-seed-boards.ts candidates.json
 */

interface Candidate {
  ats: AtsType;
  slug: string;
  company: string;
}

const CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main(): Promise<void> {
  registerAllAdapters();
  const path = process.argv[2];
  if (!path) throw new Error("usage: validate-seed-boards.ts <candidates.json>");

  const raw = JSON.parse(readFileSync(path, "utf8")) as Candidate[];
  // Dedupe on (ats, slug).
  const seen = new Set<string>();
  const candidates = raw.filter((c) => {
    const key = `${c.ats}:${c.slug.toLowerCase()}`;
    if (seen.has(key) || !c.slug) return false;
    seen.add(key);
    return true;
  });
  console.log(`validating ${candidates.length} unique candidates…`);

  const results = await mapLimit(candidates, CONCURRENCY, async (c) => {
    try {
      const jobs = await getAdapter(c.ats).pollJobs(c.slug, { companyName: c.company });
      return { ...c, ok: jobs.length > 0, count: jobs.length, status: jobs.length > 0 ? "ok" : "empty" };
    } catch (err) {
      const status = err instanceof AtsHttpError ? String(err.status) : "error";
      return { ...c, ok: false, count: 0, status };
    }
  });

  const valid = results.filter((r) => r.ok);
  const byAts: Record<string, number> = {};
  for (const v of valid) byAts[v.ats] = (byAts[v.ats] ?? 0) + 1;
  console.log(`\nvalid boards: ${valid.length} / ${candidates.length}`);
  console.log("by ats:", JSON.stringify(byAts));
  console.log("total open jobs across valid boards:", valid.reduce((s, v) => s + v.count, 0));

  const rows = valid.map((v) => ({ ats_type: v.ats, slug: v.slug, company_name: v.company }));
  const db = supabaseAdmin();
  // Insert in chunks; ignore duplicates already seeded.
  for (let j = 0; j < rows.length; j += 100) {
    const chunk = rows.slice(j, j + 100);
    const { error } = await db.from("board_sources").upsert(chunk, { onConflict: "ats_type,slug", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const { count } = await db.from("board_sources").select("id", { count: "exact", head: true });
  console.log(`\nseeded. board_sources now has ${count} total boards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
