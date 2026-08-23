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
