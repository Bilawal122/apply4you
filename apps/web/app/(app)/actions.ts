"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  FEED_MAX_AGE_DAYS,
  LIBRARY_QUESTIONS,
  PreferencesSchema,
  ProfileSchema,
  jobAgeDays,
  ukSponsorRelevant,
} from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileToRow, preferencesToRow } from "@/lib/profile";
import { enqueueProfileEmbedding, enqueueResolve, workerHeartbeat } from "@/lib/queue";

export type SaveState = { error: string } | { ok: true } | null;

export async function saveProfile(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  let profile;
  try {
    profile = ProfileSchema.parse(JSON.parse(String(formData.get("profile"))));
  } catch {
    return { error: "Invalid profile data" };
  }

  // FR-4's summary is derived by the worker, NOT here.
  //
  // This used to await deriveSummary() inline. That is a gemini-2.5-flash call
  // wrapped in withRetry(attempts = 3) with no timeout, and flash routinely
  // takes 12-20s — while a Server Action gets the platform's default function
  // limit (10s on Vercel Hobby) because, unlike /api/profile/parse, it cannot
  // declare its own maxDuration. So the function was killed mid-call: the
  // action never returned, useActionState never resolved, the button sat on
  // "Saving…" forever and the redirect never fired. The try/catch could not
  // help — a platform timeout is not an exception.
  //
  // The enqueue below already chains embed-profile -> match-user, and the
  // worker derives the summary there, where a 20s call is unremarkable.

  const { error } = await supabase
    .from("profiles")
    .update({ ...profileToRow(profile), updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // Profile changed -> re-embed -> re-match (worker chain). enqueueProfileEmbedding
  // is itself bounded and logs its own failures, so this can no longer hang the
  // save — which is exactly what it did: the row was written, the enqueue never
  // returned, and Vercel killed the function with `POST /profile 0`.
  try {
    await enqueueProfileEmbedding(user.id);
  } catch {
    // Redis being down must not block a profile save.
  }

  revalidatePath("/profile", "page");

  if (formData.get("redirectTo") === "preferences") redirect("/preferences?onboarding=1");
  return { ok: true };
}

export async function savePreferences(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  let prefs;
  try {
    prefs = PreferencesSchema.parse(JSON.parse(String(formData.get("preferences"))));
  } catch {
    return { error: "Invalid preferences data" };
  }

  const { error } = await supabase
    .from("preferences")
    .update(preferencesToRow(prefs))
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // Preferences feed the profile embedding text -> re-embed -> re-match.
  try {
    await enqueueProfileEmbedding(user.id);
  } catch {
    // Redis being down must not block a preferences save.
  }

  revalidatePath("/preferences", "page");

  const redirectTo = formData.get("redirectTo");
  if (redirectTo === "matches") redirect("/onboarding/matches");
  if (redirectTo === "feed") redirect("/feed");
  return { ok: true };
}

/** Polled by the onboarding "finding your matches" step. */
export async function getMatchingStatus(): Promise<{
  embedded: boolean;
  matches: number;
  activeApps: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { embedded: false, matches: 0, activeApps: 0 };

  const [{ data: profileRow }, { count: matches }, { count: activeApps }] = await Promise.all([
    supabase.from("profiles").select("embedding").single<{ embedding: unknown }>(),
    supabase.from("job_matches").select("job_id", { count: "exact", head: true }),
    // In-flight applications only — NOT lifetime count. Skipped/submitted
    // history must not make step 4 think it already queued this session.
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "needs_review", "approved", "submitting"]),
  ]);

  return {
    embedded: Boolean(profileRow?.embedding),
    matches: matches ?? 0,
    activeApps: activeApps ?? 0,
  };
}

/** Feed "Queue top N": bulk-create drafts for the best unapplied matches. */
export async function queueTopMatches(
  count: number,
): Promise<{ queued?: number; filling?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const n = Math.max(1, Math.min(25, Math.floor(count)));
  const admin = createAdminClient();

  const [{ data: existing }, { data: prefsRow }] = await Promise.all([
    admin.from("applications").select("job_id").eq("user_id", user.id),
    admin
      .from("preferences")
      .select("excluded_companies, needs_sponsorship")
      .eq("user_id", user.id)
      .single(),
  ]);
  const appliedJobIds = new Set((existing ?? []).map((r: { job_id: string }) => r.job_id));
  const blocklist = new Set(
    ((prefsRow?.excluded_companies ?? []) as string[]).map((c) => c.trim().toLowerCase()),
  );
  const needsSponsorship = prefsRow?.needs_sponsorship === true;

  const { data: matches } = await admin
    .from("job_matches")
    .select("job_id, jobs!inner(closed_at, company, location, sponsor_verdict, posted_at, first_seen_at)")
    .eq("user_id", user.id)
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    // Over-fetch well past n: the blocklist, sponsorship, location and age
    // gates below all filter AFTER this window, so a window of exactly n
    // starves — an onboarding user (0 applied) fetched precisely 10 rows,
    // and every gated-out row silently shrank the queue below the number
    // asked for even when eligible matches sat just past the window. The
    // slice(0, n) after filtering keeps the "top matches" meaning.
    .limit(Math.max(n * 5, 50) + appliedJobIds.size);

  // Sponsorship excludes here rather than down-ranking, unlike ranking. This
  // function spends the user's application budget without asking them job by
  // job — onboarding calls it with the top 10, which for a free account is
  // every application they have. Sending those to employers that hold no
  // licence, and legally cannot hire the person, is the wedge's oldest
  // complaint and the one thing this product exists not to do.
  const targets = (matches ?? [])
    .filter((m) => {
      const job = m.jobs as unknown as {
        company: string;
        location: string | null;
        sponsor_verdict: { licensed?: boolean } | null;
        posted_at: string | null;
        first_seen_at: string;
      };
      if (blocklist.has(job.company.trim().toLowerCase())) return false;
      if (needsSponsorship && job.sponsor_verdict?.licensed !== true) return false;
      // A UK licence is irrelevant to a recognisably non-UK role — spending
      // the user's budget on a Warsaw posting because the company holds a UK
      // licence is exactly the P1-01 failure.
      if (needsSponsorship && !ukSponsorRelevant(job.location)) return false;
      // Same age gate as the default feed: this function spends budget
      // unattended, and a months-old posting is likely already filled.
      if ((jobAgeDays(job.posted_at, job.first_seen_at) ?? 0) > FEED_MAX_AGE_DAYS) return false;
      return true;
    })
    .map((m: { job_id: string }) => m.job_id)
    .filter((id: string) => !appliedJobIds.has(id))
    .slice(0, n);
  if (targets.length === 0) {
    // Never backfill with unlicensed employers to hit the requested count —
    // say there were none, so the number the user sees stays true.
    return {
      error: needsSponsorship
        ? "No unqueued matches at licensed sponsors right now — widen your titles or locations, or turn off the sponsorship filter in preferences"
        : "No unqueued matches left — check back after the next job sync",
    };
  }

  // The event copy states only what is true RIGHT NOW: "AI is filling" needs
  // a live consumer, and a Redis PONG is not one (P0-01).
  const filling = (await workerHeartbeat()).alive;
  const queuedMessage = filling
    ? "Queued — AI is filling out the application"
    : "Queued — will be filled when the worker is back online";

  let queued = 0;
  let stranded = 0;
  for (const jobId of targets) {
    const { data: app, error } = await admin
      .from("applications")
      .insert({ user_id: user.id, job_id: jobId, mode: "auto", status: "draft" })
      .select("id")
      .single();
    if (error || !app) continue;
    await admin.from("application_events").insert({
      application_id: app.id,
      user_id: user.id,
      status: "draft",
      message: queuedMessage,
    });
    // Counted only when the enqueue actually landed. The old comment here said
    // "Worker picks it up when the queue is reachable again" — that is true of
    // `approved` rows, which the worker re-enqueues on boot, and false of
    // drafts, which nothing re-enqueues. enqueueResolve is the one enqueue that
    // deliberately throws for exactly this reason, and this loop caught it and
    // incremented anyway: the button then reported "10 started" when none had
    // been, and the drafts sat with form_schema null forever.
    try {
      await enqueueResolve(app.id);
      queued++;
    } catch {
      stranded++;
    }
  }

  revalidatePath("/feed", "page");
  revalidatePath("/applications", "page");
  // A partial result reports both halves: the drafts exist either way, so the
  // user needs to know some of them are not being worked on.
  if (stranded > 0) {
    return {
      queued,
      filling,
      error:
        `${stranded} of ${queued + stranded} couldn't reach the worker queue and are waiting — ` +
        `they'll start filling when the worker is back.`,
    };
  }
  return { queued, filling };
}

/** Feed "Queue application": create a draft and hand it to the resolve worker. */
export async function queueApplication(jobId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Users have no INSERT policy on applications — creation goes through the
  // admin client after the session check, keeping status transitions server-owned.
  const admin = createAdminClient();

  // Blocklist (DECISIONS.md D3): companies on the do-not-apply list never
  // enter the pipeline, even via a direct Queue click.
  const [{ data: jobRow }, { data: prefsRow }] = await Promise.all([
    admin.from("jobs").select("company").eq("id", jobId).single(),
    admin.from("preferences").select("excluded_companies").eq("user_id", user.id).single(),
  ]);
  const excluded = ((prefsRow?.excluded_companies ?? []) as string[]).map((c) => c.trim().toLowerCase());
  if (jobRow && excluded.includes(jobRow.company.trim().toLowerCase())) {
    return { error: `${jobRow.company} is on your do-not-apply list (Preferences → Excluded companies)` };
  }

  const { data: app, error } = await admin
    .from("applications")
    .insert({ user_id: user.id, job_id: jobId, mode: "auto", status: "draft" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Already applied to this job" };
    return { error: error.message };
  }

  await admin.from("application_events").insert({
    application_id: app.id,
    user_id: user.id,
    status: "draft",
    message: (await workerHeartbeat()).alive
      ? "Queued — AI is filling out the application"
      : "Queued — will be filled when the worker is back online",
  });

  try {
    await enqueueResolve(app.id);
  } catch {
    return { error: "Queued, but the worker queue is unreachable — it will be picked up when the worker is back" };
  }

  revalidatePath("/feed", "page");
  revalidatePath("/applications", "page");
  return {};
}

/**
 * Answer Library (task #31). Only keys we define are stored, and blanks are
 * dropped rather than saved as empty strings — an absent answer must stay
 * absent so the field still parks for review instead of submitting "".
 */
export async function saveAnswerLibrary(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  let incoming: Record<string, unknown>;
  try {
    incoming = JSON.parse(String(formData.get("answers"))) as Record<string, unknown>;
  } catch {
    return { error: "Invalid answers data" };
  }

  const allowed = new Set(LIBRARY_QUESTIONS.map((q) => q.key));
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!allowed.has(key) || typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, 2000);
    if (trimmed) answers[key] = trimmed;
  }

  const { error } = await supabase.from("profiles").update({ answer_library: answers }).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/preferences", "page");
  return { ok: true };
}
