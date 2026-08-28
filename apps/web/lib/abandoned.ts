import { DRAFT_ABANDONED_MS } from "@apply4you/shared";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Backstop for the "still filling out forever" state (P0-01).
 *
 * Only called when the worker is ALIVE: a live worker re-enqueues stranded
 * drafts every 5 minutes and each resolve gets 3 attempts, so a draft still
 * unfilled after DRAFT_ABANDONED_MS is genuinely wedged — fail it with a
 * reason so the row stops claiming progress that is not happening. Drafts
 * waiting on a DOWN worker are deliberately left alone: they self-heal the
 * moment the worker returns, and failing them would break that (nothing
 * re-enqueues a failed row).
 *
 * Scoped to one user and run from their own applications-page load — no cron
 * infrastructure, and the person who would see the lie is the one whose rows
 * get corrected.
 */
export async function failAbandonedDrafts(userId: string): Promise<number> {
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
