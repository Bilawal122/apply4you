import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { embedJob, embedProfile, jobEmbeddingText, profileEmbeddingText } from "@apply4you/ai";
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
  const db = supabaseAdmin();
  const { profile, preferences } = await loadProfileAndPrefs(userId);

  const vector = await embedProfile(profileEmbeddingText(profile, preferences));
  const { error } = await db
    .from("profiles")
    .update({ embedding: JSON.stringify(vector) })
    .eq("user_id", userId);
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
