import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { deriveSummary, embedJob, embedProfile, jobEmbeddingText, profileEmbeddingText, withUsageUser } from "@apply4you/ai";
import { queues, workerConnection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";

type EmbedJobData = { jobId: string };
type EmbedProfileData = { userId: string };

/*
 * Vectors live in `job_embeddings`, not on `jobs` (migration 0015). Keeping the
 * HNSW index off the jobs table is what makes sourcing viable: a row rewrite on
 * jobs used to cost ~198ms because every rewrite re-inserted into the vector
 * graph, and it now costs ~6ms.
 */
async function embedOneJob(jobId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: already } = await db
    .from("job_embeddings")
    .select("job_id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (already) return;

  const { data: job } = await db
    .from("jobs")
    .select("id, title, company, location, description")
    .eq("id", jobId)
    .single();
  if (!job) return;

  const vector = await embedJob(jobEmbeddingText(job));
  const { error } = await db
    .from("job_embeddings")
    .upsert({ job_id: jobId, embedding: JSON.stringify(vector) }, { onConflict: "job_id" });
  if (error) throw new Error(`embedding update failed: ${error.message}`);
}

async function embedOneProfile(userId: string): Promise<void> {
  // Everything below is this user's cost. embedOneJob deliberately stays
  // outside any context: a job embedding is shared infrastructure, not
  // attributable to whoever happened to trigger the poll.
  return withUsageUser(userId, () => embedOneProfileFor(userId));
}

async function embedOneProfileFor(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const { profile, preferences } = await loadProfileAndPrefs(userId);

  // FR-4: the summary is derived here rather than in the web save action. The
  // action runs inside a Server Action's function limit, which a flash call
  // reliably exceeds; this worker has no such ceiling and is already holding
  // the profile. Best-effort — a summary must never cost the user their
  // embedding, and therefore their matches.
  const update: Record<string, unknown> = {};
  if (!profile.summary.trim()) {
    try {
      update.summary = await deriveSummary(profile);
    } catch (err) {
      console.error(`[embed-profile] ${userId}: summary failed (continuing):`, String(err).slice(0, 160));
    }
  }

  const vector = await embedProfile(profileEmbeddingText(profile, preferences));
  update.embedding = JSON.stringify(vector);
  const { error } = await db.from("profiles").update(update).eq("user_id", userId);
  if (error) throw new Error(`profile embedding update failed: ${error.message}`);

  // A fresh profile embedding invalidates the match set.
  await queues.matching.add("match-user", { userId }, { jobId: `match-${userId}-${Date.now()}` });
}

/**
 * Profiles that were saved while Redis was unreachable.
 *
 * The web save enqueues the profile embedding best-effort, because a queue
 * that is down must never cost someone their save. Nothing retried it, though,
 * and the nightly fan-out below only visits profiles where `embedding is not
 * null` — so a profile that missed its enqueue was excluded from matching
 * permanently. The user sees an empty feed and there is no error anywhere to
 * explain it, which is the worst shape a failure can take.
 *
 * Called at the two moments the gap can actually be closed: worker boot (where
 * Redis is definitionally back, since main() pings it first) and the nightly
 * fan-out, which catches a flap that happened while the worker stayed up.
 */
export async function enqueueMissingProfileEmbeddings(): Promise<number> {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("profiles")
    .select("user_id, first_name, skills, work_history, resume_storage_path")
    .is("embedding", null);

  let queued = 0;
  for (const row of rows ?? []) {
    // A row with nothing in it is created at signup. Embedding that spends a
    // call to vectorise nothing and hands the user matches against noise, so
    // an empty profile stays unembedded until they actually fill it in.
    const hasContent =
      Boolean(row.first_name?.trim()) ||
      Boolean(row.resume_storage_path) ||
      ((row.skills as string[] | null) ?? []).length > 0 ||
      ((row.work_history as unknown[] | null) ?? []).length > 0;
    if (!hasContent) continue;

    // Unique jobId, like the web producer's. A fixed one would be permanently
    // taken after the first backfill — BullMQ keeps completed jobs by default,
    // so every later boot would silently no-op. Re-embedding a profile costs a
    // fraction of a cent; never embedding it costs the user their matches.
    await queues.profileEmbedding
      .add("embed-profile", { userId: row.user_id }, { jobId: `embed-profile-backfill-${row.user_id}-${Date.now()}` })
      .catch(() => undefined);
    queued++;
  }
  if (queued) console.log(`[embed-profile] backfilled ${queued} profile(s) that had no embedding`);
  return queued;
}

export function startEmbeddingWorker(): Worker {
  return new Worker(
    QUEUES.embedding,
    async (job: Job) => {
      if (job.name === "embed-job") return embedOneJob((job.data as EmbedJobData).jobId);
      // Legacy routing — profile embeds now ride their own queue.
      if (job.name === "embed-profile") return embedOneProfile((job.data as EmbedProfileData).userId);
      throw new Error(`Unknown embedding job: ${job.name}`);
    },
    {
      connection: workerConnection(),
      concurrency: 4,
      limiter: { max: 90, duration: 60_000 }, // leave RPM headroom for profile embeds
    },
  );
}

/** Dedicated lane so a new user's first matches arrive in seconds, not hours. */
export function startProfileEmbeddingWorker(): Worker {
  return new Worker(
    QUEUES.profileEmbedding,
    async (job: Job) => {
      if (job.name === "embed-profile") return embedOneProfile((job.data as EmbedProfileData).userId);
      throw new Error(`Unknown profile-embedding job: ${job.name}`);
    },
    { connection: workerConnection(), concurrency: 2 },
  );
}
