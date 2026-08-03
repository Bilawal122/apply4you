import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { getAdapter, AtsHttpError } from "@apply4you/ats";
import type { AtsType, NormalizedJob } from "@apply4you/shared";
import { queues, workerConnection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { refreshSponsorRegister } from "./sponsor-register.js";

interface BoardSourceRow {
  id: string;
  ats_type: AtsType;
  slug: string;
  company_name: string | null;
  consecutive_failures: number;
}

type PollBoardData = { boardSourceId: string };

const MAX_CONSECUTIVE_FAILURES = 3;
/** Cap per-new-job enrichment (Workable detail fetches) per poll to bound request volume. */
const MAX_ENRICH_PER_POLL = 50;

/*
 * Everything below is bounded because PostgREST runs as `authenticator` with a
 * hard 8s statement_timeout, and because filter values travel in the URL.
 *
 * A single 734-row upsert on `jobs` blew that timeout outright: each row fires
 * jobs_dedupe_keys_trigger AND jobs_sponsor_verdict_trigger (which calls
 * sponsor_verdict_for -> a lookup against the 126k-row sponsors table), on top
 * of normal index maintenance. The failure threw before the board's
 * last_polled_at was written, so the biggest boards — 25 of them, holding ~46%
 * of the index — silently never completed a poll. Small boards succeeded, which
 * is exactly why this looked like "sourcing works" for so long.
 *
 * Same 8s ceiling already bit match_jobs (migration 0007) and
 * apply_sponsor_verdicts (0012). Assume it will bite anything unbounded.
 */
/*
 * Any row rewrite on `jobs` costs ~198ms (measured) because it re-inserts into
 * the 127MB HNSW index, so write batches stay small enough to clear PostgREST's
 * 8s ceiling with headroom: 25 x 198ms ~ 5s.
 */
const UPSERT_CHUNK = 25;
/** Filter values go in the query string, so id lists are capped for URL length. */
const ID_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface StoredJob {
  external_id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  apply_url: string | null;
  requires_login: boolean | null;
  posted_at: string | null;
  closed_at: string | null;
}

const sameTime = (a: string | null, b: string | null): boolean =>
  a === b || (!!a && !!b && new Date(a).getTime() === new Date(b).getTime());

/**
 * UNCHANGED_SKIP — the reason sourcing kept dying.
 *
 * Every poll re-upserted every posting a board returned, unchanged or not. On
 * `jobs` that is ruinous: the table carries a 127MB HNSW index, and Postgres
 * must add the new row version to EVERY index on a rewrite, including the
 * vector graph — even though sourcing never touches `embedding`. Measured on
 * prod: 50 no-op row updates = 9.9s, of which 9.89s was index maintenance
 * (~198ms/row). PostgREST kills anything past 8s, so any board over ~35
 * postings could never complete a poll, and 25 boards holding ~46% of the
 * index were permanently stuck.
 *
 * So: compare first, write only what actually differs. A steady-state poll now
 * writes almost nothing.
 *
 * Known tradeoff: `description` is excluded from the comparison because
 * fetching every JD body on every poll (TOAST reads for ~800 rows/board) costs
 * more than it saves. A silently edited JD whose title, location, URL and dates
 * are all unchanged won't be picked up until something else about it changes.
 * The durable fix is to move `embedding` to its own table so `jobs` writes stop
 * touching HNSW at all — then this comparison can relax.
 */
function isUnchanged(prev: StoredJob, next: Record<string, unknown>): boolean {
  return (
    prev.title === next.title &&
    prev.company === next.company &&
    prev.location === next.location &&
    prev.apply_url === next.apply_url &&
    prev.requires_login === next.requires_login &&
    sameTime(prev.posted_at, (next.posted_at as string | null) ?? null) &&
    prev.closed_at === null // a previously-closed posting must be written to reopen it
  );
}

export async function schedulePolling(): Promise<void> {
  await queues.sourcing.upsertJobScheduler("poll-all-scheduler", { pattern: "0 */2 * * *" }, {
    name: "poll-all",
    data: {},
  });
}

/** Retention (DECISIONS.md D4): daily purge of long-closed, never-applied jobs. */
export async function scheduleRetention(): Promise<void> {
  await queues.sourcing.upsertJobScheduler("purge-closed-scheduler", { pattern: "30 4 * * *" }, {
    name: "purge-closed",
    data: {},
  });
}

async function purgeClosedJobs(): Promise<void> {
  const { data, error } = await supabaseAdmin().rpc("purge_closed_jobs", { p_days: 30 });
  if (error) throw new Error(`purge_closed_jobs failed: ${error.message}`);
  console.log(`[retention] purged ${data ?? 0} closed jobs (>30d old, never applied to)`);
}

async function pollAll(): Promise<void> {
  const db = supabaseAdmin();
  const { data: sources, error } = await db
    .from("board_sources")
    .select("id, ats_type, slug, company_name, consecutive_failures")
    .eq("active", true);
  if (error) throw new Error(`board_sources query failed: ${error.message}`);

  for (const source of (sources ?? []) as BoardSourceRow[]) {
    await queues.sourcing.add(
      "poll-board",
      { boardSourceId: source.id } satisfies PollBoardData,
      // Stable job id per board per cycle prevents duplicate fan-out.
      { jobId: `poll-${source.id}-${new Date().toISOString().slice(0, 13)}` },
    );
  }
  console.log(`[sourcing] fanned out ${sources?.length ?? 0} board polls`);
}

async function pollBoard(boardSourceId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: source } = await db
    .from("board_sources")
    .select("id, ats_type, slug, company_name, consecutive_failures")
    .eq("id", boardSourceId)
    .single<BoardSourceRow>();
  if (!source) return;

  const adapter = getAdapter(source.ats_type);
  let polled: NormalizedJob[];
  try {
    polled = await adapter.pollJobs(source.slug, { companyName: source.company_name ?? undefined });
  } catch (err) {
    const status = err instanceof AtsHttpError ? err.status : null;
    const failures = source.consecutive_failures + 1;
    await db
      .from("board_sources")
      .update({
        last_polled_at: new Date().toISOString(),
        last_status: status === 404 ? "not_found" : "error",
        consecutive_failures: failures,
        // 404 = board gone; repeated errors = deactivate to stop wasting polls.
        active: status === 404 ? false : failures < MAX_CONSECUTIVE_FAILURES,
      })
      .eq("id", source.id);
    throw err;
  }

  // Pull what we already hold for these postings, so unchanged ones can be
  // left alone entirely (see UNCHANGED_SKIP note below).
  const externalIds = polled.map((j) => j.externalId);
  const known = new Map<string, StoredJob>();
  for (const ids of chunk(externalIds, ID_CHUNK)) {
    const { data: existingRows, error } = await db
      .from("jobs")
      .select("external_id, title, company, location, apply_url, requires_login, posted_at, closed_at")
      .eq("ats_type", source.ats_type)
      .in("external_id", ids);
    if (error) throw new Error(`jobs existence check failed: ${error.message}`);
    for (const r of (existingRows ?? []) as StoredJob[]) known.set(r.external_id, r);
  }
  const existing = new Set(known.keys());

  let enriched = 0;
  let skipped = 0;
  const rows = [];
  for (const job of polled) {
    let finalJob = job;
    if (!existing.has(job.externalId) && adapter.enrichJob && enriched < MAX_ENRICH_PER_POLL) {
      try {
        finalJob = await adapter.enrichJob(source.slug, job);
        enriched++;
      } catch {
        // Detail fetch failed — keep the un-enriched job rather than dropping it.
      }
    }
    const row = {
      board_source_id: source.id,
      ats_type: finalJob.atsType,
      external_id: finalJob.externalId,
      title: finalJob.title,
      company: finalJob.company,
      location: finalJob.location,
      description: finalJob.description,
      apply_url: finalJob.applyUrl,
      requires_login: finalJob.requiresLogin,
      posted_at: finalJob.postedAt,
      closed_at: null, // reopened if it had vanished
      // No `raw` payload: it cost 96MB of TOAST at 18k jobs, was rewritten
      // every poll, and nothing ever read it (adapters fetch forms live).
    };

    const prev = known.get(finalJob.externalId);
    if (prev && isUnchanged(prev, row)) {
      skipped++;
      continue;
    }
    rows.push(row);
  }

  // Boards do return the same posting twice (Workable especially, when a role
  // is listed under two departments). Postgres rejects the whole statement with
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" if one batch
  // carries both, so collapse on the conflict key first — last occurrence wins.
  const deduped = [...new Map(rows.map((r) => [`${r.ats_type}:${r.external_id}`, r])).values()];

  for (const batch of chunk(deduped, UPSERT_CHUNK)) {
    const { error: upsertError } = await db
      .from("jobs")
      .upsert(batch, { onConflict: "ats_type,external_id" });
    if (upsertError) throw new Error(`jobs upsert failed: ${upsertError.message}`);
  }

  // Jobs of this board that vanished from the poll are closed. Computing the
  // difference here (rather than sending a NOT IN of every external_id) keeps
  // the request small: a board with 787 live jobs produced a ~9KB query string,
  // and the vanished set is nearly always a handful of rows.
  const seen = new Set(externalIds);
  const { data: openRows, error: openErr } = await db
    .from("jobs")
    .select("id, external_id")
    .eq("board_source_id", source.id)
    .is("closed_at", null);
  if (openErr) throw new Error(`open-jobs query failed: ${openErr.message}`);
  const vanished = ((openRows ?? []) as { id: string; external_id: string }[])
    .filter((r) => !seen.has(r.external_id))
    .map((r) => r.id);
  // Closing is a row rewrite too, so it pays the same ~198ms/row HNSW cost —
  // batch it like the upsert, not like a cheap id filter. After a long gap a
  // single board can have hundreds of vanished postings at once.
  for (const ids of chunk(vanished, UPSERT_CHUNK)) {
    const { error } = await db
      .from("jobs")
      .update({ closed_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw new Error(`closing vanished jobs failed: ${error.message}`);
  }

  // New jobs need embeddings (consumed by the Phase 3 processor).
  const newIds = polled.filter((j) => !existing.has(j.externalId)).map((j) => j.externalId);
  for (const ids of chunk(newIds, ID_CHUNK)) {
    // No "has no embedding yet" filter needed: these ids weren't in `known`, so
    // we've never stored them before. embedOneJob re-checks job_embeddings
    // anyway, so a redundant enqueue is a cheap no-op.
    const { data: newRows, error } = await db
      .from("jobs")
      .select("id")
      .eq("ats_type", source.ats_type)
      .in("external_id", ids);
    if (error) throw new Error(`new-jobs query failed: ${error.message}`);
    // addBulk, not one add per job: a 700-job board was 700 sequential round trips.
    await queues.embedding.addBulk(
      (newRows ?? []).map((row: { id: string }) => ({
        name: "embed-job",
        data: { jobId: row.id },
        opts: { jobId: `embed-job-${row.id}` },
      })),
    );
  }

  await db
    .from("board_sources")
    .update({
      last_polled_at: new Date().toISOString(),
      last_status: "ok",
      consecutive_failures: 0,
    })
    .eq("id", source.id);

  console.log(
    `[sourcing] ${source.ats_type}/${source.slug}: ${polled.length} open, ${newIds.length} new, ${rows.length} written, ${skipped} unchanged`,
  );
}

export function startSourcingWorker(): Worker {
  return new Worker(
    QUEUES.sourcing,
    async (job: Job) => {
      if (job.name === "poll-all") return pollAll();
      if (job.name === "poll-board") return pollBoard((job.data as PollBoardData).boardSourceId);
      if (job.name === "purge-closed") return purgeClosedJobs();
      if (job.name === "refresh-sponsors") return refreshSponsorRegister();
      throw new Error(`Unknown sourcing job: ${job.name}`);
    },
    {
      connection: workerConnection(),
      concurrency: 4,
      limiter: { max: 60, duration: 60_000 },
    },
  );
}
