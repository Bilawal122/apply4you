import { DRAFT_ABANDONED_MS } from "@apply4you/shared";
import { resolveBacklog, type WorkerHeartbeat } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A worker must have been up at least this long before its aliveness is
 * evidence that a draft was actually retried. The stranded-draft re-enqueue
 * runs at boot and every 5 minutes, and resolve is rate-limited, so a worker
 * that came back seconds ago has drained nothing yet.
 */
const WORKER_STEADY_MS = 15 * 60 * 1000;

/**
 * Backstop for the "still filling out forever" state (P0-01).
 *
 * Two conditions, and the second is the subtle one. A draft older than
 * DRAFT_ABANDONED_MS is only genuinely wedged if a worker was there to retry
 * it — and `alive` proves the worker is up NOW, not that it was up during
 * those 24 hours. After a long outage the whole backlog is >24h old and the
 * just-revived worker is about to fill it: failing those rows would be both
 * wrong and irreversible, because resolveApplication skips anything whose
 * status is no longer `draft`, so nothing ever picks a failed row back up.
 * Hence the uptime gate — the worker must have been running long enough to
 * have actually had its turn at the backlog.
 *
 * Drafts waiting on a DOWN worker are likewise left alone: they self-heal
 * when it returns, and the UI says so rather than claiming progress.
 *
 * Scoped to one user and run from their own applications-page load — no cron
 * infrastructure, and the person who would see the lie is the one whose rows
 * get corrected.
 */
export async function failAbandonedDrafts(
  userId: string,
  worker: WorkerHeartbeat,
): Promise<number> {
  if (!worker.alive || !worker.startedAt) return 0;
  const uptime = Date.now() - new Date(worker.startedAt).getTime();
  if (!Number.isFinite(uptime) || uptime < WORKER_STEADY_MS) return 0;

  // Uptime alone is not enough. Production carried 37 drafts unfilled for
  // weeks; the resolve worker drains at concurrency 3 under a 30/min limiter
  // with a form read and LLM calls per job, so that backlog outlasts any
  // fixed uptime window. While ANY resolve work is queued or running, a
  // draft is still on its way — abandoning it here would be wrong and
  // irreversible. An unreadable depth counts as busy.
  const backlog = await resolveBacklog();
  if (backlog === null || backlog > 0) return 0;

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DRAFT_ABANDONED_MS).toISOString();
  const { data: rows, error } = await admin
    .from("applications")
    .update({
      status: "failed",
      failure_reason: "couldn't be filled after repeated attempts over 24 hours",
    })
    .eq("user_id", userId)
    .eq("status", "draft")
    .is("form_schema", null)
    .lt("created_at", cutoff)
    .select("id");
  if (error || !rows?.length) return 0;

  await admin.from("application_events").insert(
    rows.map((r) => ({
      application_id: r.id,
      user_id: userId,
      status: "failed",
      message:
        "Couldn't be filled after repeated attempts over 24 hours — you can apply manually via the job's page",
    })),
  );
  return rows.length;
}
