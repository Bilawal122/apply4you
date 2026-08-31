import { supabaseAdmin } from "../supabase.js";
import { queues } from "../queues.js";
import { submitQueueFor, type AtsType } from "@apply4you/shared";

/**
 * Re-arms an ATS after the circuit breaker paused it (DECISIONS.md D3.7).
 *
 * The breaker is deliberately manual: three consecutive captcha/bot-wall
 * failures are the leading indicator of a ban, so nothing auto-resumes on a
 * timer. But "manual" previously meant hand-written SQL against production,
 * because no script, admin UI or probe existed — and every held application
 * sat at `approved`, each one consuming a slot of the user's cap while it
 * waited. This is the intended remedy.
 *
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/unpause-ats.ts <ats> [--requeue]
 */

const ATS_TYPES = ["greenhouse", "lever", "ashby", "workable"] as const;

async function main(): Promise<void> {
  const [ats, ...flags] = process.argv.slice(2);
  const requeue = flags.includes("--requeue");

  if (!ats || !ATS_TYPES.includes(ats as AtsType)) {
    console.error(`usage: unpause-ats.ts <${ATS_TYPES.join("|")}> [--requeue]`);
    process.exit(1);
  }
  const atsType = ats as AtsType;
  const db = supabaseAdmin();

  const { data: health } = await db
    .from("ats_health")
    .select("paused, consecutive_failures, last_failure_reason")
    .eq("ats_type", atsType)
    .single();

  if (!health) {
    console.error(`no ats_health row for ${atsType}`);
    process.exit(1);
  }
  if (!health.paused) {
    console.log(`${atsType} is not paused (consecutive_failures=${health.consecutive_failures}).`);
  } else {
    console.log(
      `${atsType} paused after ${health.consecutive_failures} failures — last: ${health.last_failure_reason ?? "(none)"}`,
    );
  }

  const { error } = await db
    .from("ats_health")
    .update({ paused: false, consecutive_failures: 0, last_failure_reason: null, updated_at: new Date().toISOString() })
    .eq("ats_type", atsType);
  if (error) {
    console.error(`failed to re-arm: ${error.message}`);
    process.exit(1);
  }
  console.log(`${atsType} re-armed.`);

  // Applications held by the breaker stay `approved` — they were never claimed,
  // so nothing re-enqueues them until the next worker boot.
  const { data: held } = await db
    .from("applications")
    .select("id, jobs!inner(ats_type)")
    .eq("status", "approved")
    .eq("jobs.ats_type", atsType);

  const ids = (held ?? []).map((a) => a.id as string);
  if (ids.length === 0) {
    console.log("no applications were held.");
    return;
  }
  if (!requeue) {
    console.log(`${ids.length} application(s) still held at 'approved'. Re-run with --requeue to enqueue them now`);
    console.log("(they will also be picked up on the next worker boot).");
    return;
  }

  const queueName = submitQueueFor(atsType);
  const queue = Object.values(queues).find((q) => q.name === queueName);
  if (!queue) {
    console.error(`no local Queue instance for ${queueName}`);
    process.exit(1);
  }
  for (const id of ids) {
    // removeOnComplete/removeOnFail: a retained record under this
    // deterministic jobId silently swallows every later re-enqueue.
    await queue.add(
      "submit-application",
      { applicationId: id },
      { jobId: `submit-${id}`, removeOnComplete: true, removeOnFail: true },
    );
  }
  console.log(`re-enqueued ${ids.length} application(s) to ${queueName}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
