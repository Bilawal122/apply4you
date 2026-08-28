import { Worker, type Job } from "bullmq";
import { MATCH_LIMIT, QUEUES, REASONS_FOR_TOP, rankMatches } from "@apply4you/shared";
import { generateMatchReasons, withUsageUser } from "@apply4you/ai";
import { queues, workerConnection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";
import { enqueueMissingProfileEmbeddings } from "./embed.js";

type MatchUserData = { userId: string };

async function matchUser(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const { profile, preferences } = await loadProfileAndPrefs(userId);

  const { data: matches, error } = await db.rpc("match_jobs", {
    p_user_id: userId,
    p_limit: MATCH_LIMIT,
  });
  if (error) throw new Error(`match_jobs failed: ${error.message}`);
  if (!matches?.length) {
    console.log(`[matching] ${userId}: no matches (profile embedded? jobs embedded?)`);
    return;
  }

  const jobIds = matches.map((m: { job_id: string }) => m.job_id);
  type JobRow = {
    id: string; title: string; company: string; description: string | null;
    sponsor_verdict: { licensed?: boolean } | null;
    location: string | null;
  };
  const { data: jobs } = await db
    .from("jobs")
    .select("id, title, company, description, sponsor_verdict, location")
    .in("id", jobIds)
    .overrideTypes<JobRow[]>();
  const jobById = new Map<string, JobRow>((jobs ?? []).map((j) => [j.id, j]));

  // Title boost happens here (not SQL) — token matching is easier in TS. Shared
  // with the web's inline path so both produce the same order.
  const scored = rankMatches(
    matches.map((m: { job_id: string; score: number }) => ({
      jobId: m.job_id,
      score: m.score,
      title: jobById.get(m.job_id)?.title ?? "",
      sponsorLicensed: jobById.get(m.job_id)?.sponsor_verdict?.licensed === true,
      location: jobById.get(m.job_id)?.location ?? null,
    })),
    preferences,
  );

  // One-line reasons for the top slice only (cost control).
  const top = scored.slice(0, REASONS_FOR_TOP);
  let reasons = new Map<string, string>();
  try {
    reasons = await withUsageUser(userId, () =>
      generateMatchReasons(
        profile,
        top.flatMap(({ jobId }: { jobId: string }) => {
          const j = jobById.get(jobId);
          return j ? [{ jobId: j.id, title: j.title, company: j.company, descriptionSnippet: j.description ?? "" }] : [];
        }),
      ),
    );
  } catch (err) {
    console.warn(`[matching] reasons failed for ${userId}: ${String(err)}`);
  }

  const rows = scored.map(({ jobId, score }: { jobId: string; score: number }) => ({
    user_id: userId,
    job_id: jobId,
    score,
    reason: reasons.get(jobId) ?? null,
  }));

  const { error: upsertError } = await db.from("job_matches").upsert(rows, { onConflict: "user_id,job_id" });
  if (upsertError) throw new Error(`job_matches upsert failed: ${upsertError.message}`);

  console.log(`[matching] ${userId}: ${rows.length} matches, ${reasons.size} reasons`);
}

export async function scheduleNightlyMatching(): Promise<void> {
  // Re-match all users with an embedded profile every night at 06:00 UTC.
  await queues.matching.upsertJobScheduler("match-all-scheduler", { pattern: "0 6 * * *" }, {
    name: "match-all",
    data: {},
  });
}

async function matchAll(): Promise<void> {
  const db = supabaseAdmin();
  // A profile whose embedding enqueue was dropped (Redis down at save time)
  // would never appear in the query below, and so would never be matched.
  // Give it its embedding first; it joins tomorrow's fan-out.
  await enqueueMissingProfileEmbeddings();
  const { data: users } = await db.from("profiles").select("user_id").not("embedding", "is", null);
  for (const u of users ?? []) {
    await queues.matching.add("match-user", { userId: u.user_id }, { jobId: `match-${u.user_id}-${Date.now()}` });
  }
  console.log(`[matching] nightly fan-out: ${users?.length ?? 0} users`);
}

export function startMatchingWorker(): Worker {
  return new Worker(
    QUEUES.matching,
    async (job: Job) => {
      if (job.name === "match-user") return matchUser((job.data as MatchUserData).userId);
      if (job.name === "match-all") return matchAll();
      throw new Error(`Unknown matching job: ${job.name}`);
    },
    { connection: workerConnection(), concurrency: 2 },
  );
}
