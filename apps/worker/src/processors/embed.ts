import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { embedJob, embedProfile, jobEmbeddingText, profileEmbeddingText } from "@apply4you/ai";
import { connection, queues } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";

type EmbedJobData = { jobId: string };
type EmbedProfileData = { userId: string };

async function embedOneJob(jobId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: job } = await db
    .from("jobs")
    .select("id, title, company, location, description, embedding")
    .eq("id", jobId)
    .single();
  if (!job || job.embedding) return;

  const vector = await embedJob(jobEmbeddingText(job));
  const { error } = await db.from("jobs").update({ embedding: JSON.stringify(vector) }).eq("id", jobId);
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
      if (job.name === "embed-profile") return embedOneProfile((job.data as EmbedProfileData).userId);
      throw new Error(`Unknown embedding job: ${job.name}`);
    },
    {
      connection,
      concurrency: 4,
      limiter: { max: 100, duration: 60_000 }, // stay under Gemini embedding RPM
    },
  );
}
