import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { getAdapter, AtsHttpError } from "@apply4you/ats";
import type { AtsType, NormalizedJob } from "@apply4you/shared";
import { connection, queues } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";

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

  // Which of these are new to us?
  const externalIds = polled.map((j) => j.externalId);
  const { data: existingRows } = await db
    .from("jobs")
    .select("external_id")
    .eq("ats_type", source.ats_type)
    .in("external_id", externalIds.length ? externalIds : ["__none__"]);
  const existing = new Set((existingRows ?? []).map((r: { external_id: string }) => r.external_id));

  let enriched = 0;
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
    rows.push({
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
    });
  }

  if (rows.length > 0) {
    const { error: upsertError } = await db
      .from("jobs")
      .upsert(rows, { onConflict: "ats_type,external_id" });
    if (upsertError) throw new Error(`jobs upsert failed: ${upsertError.message}`);
  }

  // Jobs of this board that vanished from the poll are closed.
  const closeQuery = db
    .from("jobs")
    .update({ closed_at: new Date().toISOString() })
    .eq("board_source_id", source.id)
    .is("closed_at", null);
  if (externalIds.length > 0) {
    closeQuery.not("external_id", "in", `(${externalIds.map((id) => `"${id}"`).join(",")})`);
  }
  await closeQuery;

  // New jobs need embeddings (consumed by the Phase 3 processor).
  const newIds = polled.filter((j) => !existing.has(j.externalId)).map((j) => j.externalId);
  if (newIds.length > 0) {
    const { data: newRows } = await db
      .from("jobs")
      .select("id")
      .eq("ats_type", source.ats_type)
      .in("external_id", newIds)
      .is("embedding", null);
    for (const row of newRows ?? []) {
      await queues.embedding.add("embed-job", { jobId: row.id }, { jobId: `embed-job-${row.id}` });
    }
  }

  await db
    .from("board_sources")
    .update({
      last_polled_at: new Date().toISOString(),
      last_status: "ok",
      consecutive_failures: 0,
    })
    .eq("id", source.id);

  console.log(`[sourcing] ${source.ats_type}/${source.slug}: ${polled.length} open, ${newIds.length} new`);
}

export function startSourcingWorker(): Worker {
  return new Worker(
    QUEUES.sourcing,
    async (job: Job) => {
      if (job.name === "poll-all") return pollAll();
      if (job.name === "poll-board") return pollBoard((job.data as PollBoardData).boardSourceId);
      if (job.name === "purge-closed") return purgeClosedJobs();
      throw new Error(`Unknown sourcing job: ${job.name}`);
    },
    {
      connection,
      concurrency: 4,
      limiter: { max: 60, duration: 60_000 },
    },
  );
}
