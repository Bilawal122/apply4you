import { embedProfile, profileEmbeddingText } from "@apply4you/ai";
import { MATCH_LIMIT, rankMatches } from "@apply4you/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { rowToPreferences, rowToProfile, type PreferencesRow, type ProfileRow } from "@/lib/profile";

/**
 * Matching, run inside a web request instead of the worker.
 *
 * The normal path is the queue: saving a profile enqueues embed-profile, which
 * chains to match-user, which also writes an AI one-line "why" for the top
 * slice. That path needs Redis, and when Redis is unreachable the enqueue is
 * dropped best-effort — the save survives, but nothing ever produces a match,
 * the feed sits on "matching in progress…" behind an auto-refresh, and there is
 * no error anywhere to explain it. A user cannot tell that apart from a product
 * that simply does not work.
 *
 * So the web can do it too. The expensive part of the worker's version is the
 * per-job reason generation, which is already best-effort there; everything
 * load-bearing is one embedding call plus one SQL function, and `match_jobs`
 * returns in ~40ms warm against 23k embedded jobs. Reasons are deliberately
 * left out — a row with a null reason renders fine (the feed falls back to the
 * job description excerpt), and the worker fills them in when it next runs.
 */
export async function runMatchNow(userId: string): Promise<{ embedded: boolean; matches: number }> {
  const db = createAdminClient();

  const [{ data: profileRowRaw }, { data: prefsRowRaw }] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).single(),
    db.from("preferences").select("*").eq("user_id", userId).single(),
  ]);
  if (!profileRowRaw) throw new Error("profile not found");
  if (!prefsRowRaw) throw new Error("preferences not found");

  const profile = rowToProfile(profileRowRaw as ProfileRow);
  const preferences = rowToPreferences(prefsRowRaw as PreferencesRow);

  // Re-embed every time rather than only when the column is null: this runs
  // after a profile or preferences change, and both feed the embedding text.
  // A stale embedding would silently rank against the previous version of the
  // person, which is the failure this function exists to prevent.
  const vector = await embedProfile(profileEmbeddingText(profile, preferences));
  const { error: embedError } = await db
    .from("profiles")
    .update({ embedding: JSON.stringify(vector) })
    .eq("user_id", userId);
  if (embedError) throw new Error(`profile embedding update failed: ${embedError.message}`);

  const { data: candidates, error: matchError } = await db.rpc("match_jobs", {
    p_user_id: userId,
    p_limit: MATCH_LIMIT,
  });
  if (matchError) throw new Error(`match_jobs failed: ${matchError.message}`);
  if (!candidates?.length) return { embedded: true, matches: 0 };

  const jobIds = candidates.map((c: { job_id: string }) => c.job_id);
  const { data: jobs } = await db
    .from("jobs")
    .select("id, title, sponsor_verdict")
    .in("id", jobIds)
    .overrideTypes<{ id: string; title: string; sponsor_verdict: { licensed?: boolean } | null }[]>();
  const jobById = new Map((jobs ?? []).map((j) => [j.id, j]));

  const scored = rankMatches(
    candidates.map((c: { job_id: string; score: number }) => ({
      jobId: c.job_id,
      score: c.score,
      title: jobById.get(c.job_id)?.title ?? "",
      sponsorLicensed: jobById.get(c.job_id)?.sponsor_verdict?.licensed === true,
    })),
    preferences,
  );

  // `reason` is omitted, not nulled: on a row the worker has already written a
  // reason for, an explicit null would erase it and the feed would lose the
  // line it prefers to show.
  const { error: upsertError } = await db
    .from("job_matches")
    .upsert(
      scored.map(({ jobId, score }) => ({ user_id: userId, job_id: jobId, score })),
      { onConflict: "user_id,job_id" },
    );
  if (upsertError) throw new Error(`job_matches upsert failed: ${upsertError.message}`);

  return { embedded: true, matches: scored.length };
}
