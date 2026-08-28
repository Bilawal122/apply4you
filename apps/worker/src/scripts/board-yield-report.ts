import { UK_LOCATION_PATTERNS, isUkLocation } from "@apply4you/shared";
import { supabaseAdmin } from "../supabase.js";

/**
 * Which boards are earning their place?
 *
 * The product's wedge is UK graduates and international students needing
 * sponsorship, and the board list is a US/global tech roster: at the time this
 * was written, 168 of 291 active boards had produced ZERO UK-located jobs
 * between them while contributing 8,619 open jobs — a third of the index — that
 * no UK user can take. Every one of those costs a poll, an embedding, and space
 * in the vector neighbourhood that a usable job could have occupied.
 *
 * There was no way to see that. `ats-metrics-report.ts` covers submission
 * health per ATS; nothing covered supply per board. So this exists to make the
 * question answerable on demand rather than by hand-written SQL, and to make
 * the answer re-checkable after the board list changes.
 *
 * Reads only. Deciding what to do about a bad board — deactivate it, or accept
 * it for non-UK users later — stays a human call.
 *
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/board-yield-report.ts
 *      …  --all      list every board, not just the notable ones
 *      …  --csv      machine-readable, for spreadsheets
 */

interface BoardRow {
  id: string;
  ats_type: string;
  slug: string;
  company_name: string | null;
  active: boolean;
  last_polled_at: string | null;
  last_status: string | null;
}

interface Yield {
  board: BoardRow;
  jobs: number;
  uk: number;
  pct: number;
}

/** Boards below this are candidates for deactivation, given enough evidence. */
const POOR_YIELD_PCT = 2;
/** …but only once they have produced enough jobs for the percentage to mean anything. */
const MIN_JOBS_TO_JUDGE = 20;

function pad(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n);
}

function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  return `${days}d`;
}

async function main(): Promise<void> {
  const db = supabaseAdmin();
  const showAll = process.argv.includes("--all");
  const asCsv = process.argv.includes("--csv");

  const { data: boards, error } = await db
    .from("board_sources")
    .select("id, ats_type, slug, company_name, active, last_polled_at, last_status")
    .overrideTypes<BoardRow[]>();
  if (error) throw new Error(error.message);

  // One pass over open jobs rather than a query per board: 300+ boards would
  // otherwise be 300+ round trips, and the whole open set is ~26k rows.
  const { data: jobs, error: jobsError } = await db
    .from("jobs")
    .select("board_source_id, location")
    .is("closed_at", null)
    .overrideTypes<{ board_source_id: string | null; location: string | null }[]>();
  if (jobsError) throw new Error(jobsError.message);

  const counts = new Map<string, { jobs: number; uk: number }>();
  let orphanJobs = 0;
  for (const job of jobs ?? []) {
    if (!job.board_source_id) {
      orphanJobs++;
      continue;
    }
    const entry = counts.get(job.board_source_id) ?? { jobs: 0, uk: 0 };
    entry.jobs++;
    if (isUkLocation(job.location)) entry.uk++;
    counts.set(job.board_source_id, entry);
  }

  const yields: Yield[] = (boards ?? []).map((board) => {
    const c = counts.get(board.id) ?? { jobs: 0, uk: 0 };
    return { board, jobs: c.jobs, uk: c.uk, pct: c.jobs ? (100 * c.uk) / c.jobs : 0 };
  });
  yields.sort((a, b) => b.uk - a.uk || b.jobs - a.jobs);

  if (asCsv) {
    console.log("ats_type,slug,company_name,active,open_jobs,uk_jobs,pct_uk,last_polled");
    for (const y of yields) {
      const name = (y.board.company_name ?? "").replace(/,/g, " ");
      console.log(
        [
          y.board.ats_type,
          y.board.slug,
          name,
          y.board.active,
          y.jobs,
          y.uk,
          y.pct.toFixed(1),
          y.board.last_polled_at ?? "",
        ].join(","),
      );
    }
    return;
  }

  const totalJobs = yields.reduce((n, y) => n + y.jobs, 0);
  const totalUk = yields.reduce((n, y) => n + y.uk, 0);
  const active = yields.filter((y) => y.board.active);
  const deadWeight = active.filter((y) => y.uk === 0 && y.jobs > 0);
  // Judged only where there is enough evidence: a board with 3 jobs and no UK
  // one has told us nothing yet.
  const poor = active.filter(
    (y) => y.uk > 0 && y.jobs >= MIN_JOBS_TO_JUDGE && y.pct < POOR_YIELD_PCT,
  );
  const silent = active.filter((y) => y.jobs === 0);

  console.log(`\nBOARD YIELD — ${yields.length} boards, ${active.length} active`);
  console.log(
    `${totalJobs.toLocaleString()} open jobs, ${totalUk.toLocaleString()} UK-located (${
      totalJobs ? ((100 * totalUk) / totalJobs).toFixed(1) : "0"
    }%)\n`,
  );

  const table = (rows: Yield[], title: string) => {
    if (rows.length === 0) return;
    console.log(`── ${title} ──`);
    console.log(`${pad("ats", 11)}${pad("slug", 26)}${"jobs".padStart(7)}${"uk".padStart(6)}${"uk%".padStart(7)}   polled`);
    for (const y of rows) {
      console.log(
        pad(y.board.ats_type, 11) +
          pad(y.board.slug, 26) +
          String(y.jobs).padStart(7) +
          String(y.uk).padStart(6) +
          `${y.pct.toFixed(1)}%`.padStart(7) +
          `   ${daysAgo(y.board.last_polled_at)}${y.board.last_status && y.board.last_status !== "ok" ? ` (${y.board.last_status})` : ""}`,
      );
    }
    console.log("");
  };

  table(showAll ? active : active.filter((y) => y.uk > 0).slice(0, 25), showAll ? "ALL ACTIVE" : "BEST UK YIELD (top 25)");

  if (!showAll) {
    console.log(`── NO UK JOBS AT ALL — ${deadWeight.length} boards, ${deadWeight
      .reduce((n, y) => n + y.jobs, 0)
      .toLocaleString()} open jobs ──`);
    console.log(deadWeight.map((y) => `${y.board.ats_type}:${y.board.slug}`).join(", ") || "(none)");
    console.log("");

    if (poor.length) {
      console.log(`── UNDER ${POOR_YIELD_PCT}% UK (${MIN_JOBS_TO_JUDGE}+ jobs) — ${poor.length} boards ──`);
      console.log(poor.map((y) => `${y.board.ats_type}:${y.board.slug} (${y.pct.toFixed(1)}%)`).join(", "));
      console.log("");
    }

    if (silent.length) {
      console.log(`── ACTIVE BUT NO OPEN JOBS — ${silent.length} boards ──`);
      console.log(silent.map((y) => `${y.board.ats_type}:${y.board.slug}`).join(", "));
      console.log("");
    }
  }

  if (orphanJobs) {
    console.log(`note: ${orphanJobs.toLocaleString()} open jobs have no board_source_id (source deleted).\n`);
  }
  console.log(`UK matched on: ${UK_LOCATION_PATTERNS.length} location patterns. Re-run with --csv for a spreadsheet.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
