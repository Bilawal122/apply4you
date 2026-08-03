import type { Worker } from "bullmq";
import { registerAllAdapters } from "@apply4you/ats";
import { registerUsageSink } from "./usage.js";
import { connection, queues } from "./queues.js";
import { supabaseAdmin } from "./supabase.js";
import { schedulePolling, scheduleRetention, startSourcingWorker } from "./processors/source-poll.js";
import { scheduleSponsorRefresh } from "./processors/sponsor-register.js";
import { startEmbeddingWorker, startProfileEmbeddingWorker } from "./processors/embed.js";
import { scheduleNightlyMatching, startMatchingWorker } from "./processors/match.js";
import { startResolveWorker } from "./processors/resolve.js";
import { startSubmitWorkers } from "./processors/submit.js";

/** Optional Sentry (DECISIONS.md D3.8): activates only when SENTRY_DSN is set. */
let sentryCapture: ((err: unknown) => void) | null = null;
async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({ dsn, tracesSampleRate: 0 });
    sentryCapture = (err) => Sentry.captureException(err);
    console.log("[worker] sentry enabled");
  } catch (err) {
    console.error("[worker] sentry init failed:", String(err).slice(0, 200));
  }
}

/**
 * Job failures are otherwise invisible (BullMQ retains them silently) — the
 * match_jobs statement-timeout regression went unnoticed for days this way.
 */
function logFailures(...workers: Worker[]): void {
  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(`[${worker.name}] job ${job?.id ?? "?"} (${job?.name ?? "?"}) FAILED: ${String(err?.message ?? err).slice(0, 300)}`);
      sentryCapture?.(err);
    });
    worker.on("error", (err) => {
      console.error(`[${worker.name}] worker error: ${String(err?.message ?? err).slice(0, 300)}`);
      sentryCapture?.(err);
    });
  }
}

/** A live submission never takes this long — older means the worker died. */
const SUBMITTING_STALE_MS = 10 * 60 * 1000;

/**
 * Startup reconciliation (DECISIONS.md D3): a row stuck in `submitting` means a
 * worker died mid-submission — the click may or may not have landed. Park it
 * for a human to verify against the ATS confirmation email; NEVER auto-requeue
 * (double-submit risk). Only rows whose last `submitting` event is stale are
 * parked, so an overlapping deploy / second worker's genuinely in-flight
 * submission is left alone.
 */
async function reconcileStuckSubmissions(): Promise<void> {
  const db = supabaseAdmin();
  const { data: stuckRows } = await db.from("applications").select("id, user_id").eq("status", "submitting");
  let parked = 0;
  for (const row of stuckRows ?? []) {
    const { data: lastEvent } = await db
      .from("application_events")
      .select("created_at")
      .eq("application_id", row.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const age = lastEvent ? Date.now() - new Date(lastEvent.created_at).getTime() : Infinity;
    if (age < SUBMITTING_STALE_MS) continue; // possibly in-flight elsewhere — leave it

    const { data: updated } = await db
      .from("applications")
      .update({
        status: "needs_manual_verification",
        failure_reason: "worker restarted mid-submission — verify against the ATS before any retry",
      })
      .eq("id", row.id)
      .eq("status", "submitting")
      .select("id");
    if (!updated?.length) continue;
    parked++;
    await db.from("application_events").insert({
      application_id: row.id,
      user_id: row.user_id,
      status: "needs_manual_verification",
      message: "Submission was interrupted — check your email for an ATS confirmation before retrying",
    });
  }
  if (parked) console.log(`[worker] reconciled ${parked} application(s) stuck in 'submitting' -> needs_manual_verification`);
}

/**
 * Boot re-enqueue: `approved` rows whose queue job was consumed without a
 * submission (circuit-breaker hold, crash after claim-refusal, lost Redis
 * state) would otherwise be zombies — nothing re-enqueues them. The fixed
 * jobId dedupes against a still-waiting job, and claimApplication's atomic
 * approved->submitting transition makes a double add harmless.
 */
async function reenqueueApprovedApplications(): Promise<void> {
  const db = supabaseAdmin();
  const { data: paused } = await db.from("ats_health").select("ats_type").eq("paused", true);
  const pausedSet = new Set((paused ?? []).map((r) => r.ats_type as string));

  const submitQueues: Record<string, (typeof queues)["submitGreenhouse"]> = {
    greenhouse: queues.submitGreenhouse,
    lever: queues.submitLever,
    ashby: queues.submitAshby,
    workable: queues.submitWorkable,
  };

  const { data: approved } = await db
    .from("applications")
    .select("id, jobs!inner(ats_type)")
    .eq("status", "approved");
  let requeued = 0;
  for (const row of approved ?? []) {
    const ats = (row.jobs as unknown as { ats_type: string }).ats_type;
    if (pausedSet.has(ats)) continue; // still held by the breaker
    const queue = submitQueues[ats];
    if (!queue) continue;
    await queue
      .add("submit-application", { applicationId: row.id }, { jobId: `submit-${row.id}` })
      .catch(() => undefined);
    requeued++;
  }
  if (requeued) console.log(`[worker] re-enqueued ${requeued} approved application(s)`);
}

async function main(): Promise<void> {
  const pong = await connection.ping();
  console.log(`[worker] redis connected (${pong})`);

  await initSentry();
  registerAllAdapters();
  registerUsageSink();
  await reconcileStuckSubmissions();
  await reenqueueApprovedApplications();

  await schedulePolling();
  await scheduleRetention();
  await scheduleSponsorRefresh();
  const sourcing = startSourcingWorker();
  console.log("[worker] sourcing worker started (poll-all every 2h, retention purge daily, sponsor register weekly)");

  await scheduleNightlyMatching();
  const embedding = startEmbeddingWorker();
  const profileEmbedding = startProfileEmbeddingWorker();
  const matching = startMatchingWorker();
  console.log("[worker] embedding + matching workers started");

  const resolve = startResolveWorker();
  console.log("[worker] resolve worker started");

  const submits = startSubmitWorkers();
  console.log("[worker] submit workers started (per-ATS queues)");

  logFailures(sourcing, embedding, profileEmbedding, matching, resolve, ...submits);

  setInterval(() => {
    console.log(`[worker] heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  console.log("[worker] up");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
