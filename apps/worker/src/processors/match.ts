import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { generateMatchReasons } from "@apply4you/ai";
import { connection, queues } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";

type MatchUserData = { userId: string };

const MATCH_LIMIT = 100;
const REASONS_FOR_TOP = 40;
const TITLE_BOOST = 8;

function titleMatches(prefTitles: string[], jobTitle: string): boolean {
  const title = jobTitle.toLowerCase();
  return prefTitles.some((t) => {
    const tokens = t.toLowerCase().split(/\s+/).filter((tok) => tok.length > 2);
    return tokens.length > 0 && tokens.every((tok) => title.includes(tok));
  });
}

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
  type JobRow = { id: string; title: string; company: string; description: string | null };
  const { data: jobs } = await db
    .from("jobs")
    .select("id, title, company, description")
    .in("id", jobIds)
    .overrideTypes<JobRow[]>();
  const jobById = new Map<string, JobRow>((jobs ?? []).map((j) => [j.id, j]));

  // Title boost happens here (not SQL) — token matching is easier in TS.
  const scored = matches.map((m: { job_id: string; score: number }) => {
    const job = jobById.get(m.job_id);
    const boost = job && titleMatches(preferences.titles, job.title) ? TITLE_BOOST : 0;
    return { jobId: m.job_id, score: Math.min(100, m.score + boost) };
  });
  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  // One-line reasons for the top slice only (cost control).
  const top = scored.slice(0, REASONS_FOR_TOP);
  let reasons = new Map<string, string>();
  try {
    reasons = await generateMatchReasons(
      profile,
      top.flatMap(({ jobId }: { jobId: string }) => {
        const j = jobById.get(jobId);
        return j ? [{ jobId: j.id, title: j.title, company: j.company, descriptionSnippet: j.description ?? "" }] : [];
      }),
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
    { connection, concurrency: 2 },
  );
}
