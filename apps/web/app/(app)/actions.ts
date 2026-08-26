"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LIBRARY_QUESTIONS, ProfileSchema, PreferencesSchema } from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileToRow, preferencesToRow } from "@/lib/profile";
import { enqueueProfileEmbedding, enqueueResolve } from "@/lib/queue";

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
export async function queueTopMatches(count: number): Promise<{ queued?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const n = Math.max(1, Math.min(25, Math.floor(count)));
  const admin = createAdminClient();

  const [{ data: existing }, { data: prefsRow }] = await Promise.all([
    admin.from("applications").select("job_id").eq("user_id", user.id),
    admin.from("preferences").select("excluded_companies").eq("user_id", user.id).single(),
  ]);
  const appliedJobIds = new Set((existing ?? []).map((r: { job_id: string }) => r.job_id));
  const blocklist = new Set(
    ((prefsRow?.excluded_companies ?? []) as string[]).map((c) => c.trim().toLowerCase()),
  );

  const { data: matches } = await admin
    .from("job_matches")
    .select("job_id, jobs!inner(closed_at, company)")
    .eq("user_id", user.id)
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    .limit(n + appliedJobIds.size);

  const targets = (matches ?? [])
    .filter((m) => {
      const company = (m.jobs as unknown as { company: string }).company;
      return !blocklist.has(company.trim().toLowerCase());
    })
    .map((m: { job_id: string }) => m.job_id)
    .filter((id: string) => !appliedJobIds.has(id))
    .slice(0, n);
  if (targets.length === 0) return { error: "No unqueued matches left — check back after the next job sync" };

  let queued = 0;
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
      message: "Queued — AI is filling out the application",
    });
    try {
      await enqueueResolve(app.id);
    } catch {
      // Worker picks it up when the queue is reachable again.
    }
    queued++;
  }

  revalidatePath("/feed", "page");
  revalidatePath("/applications", "page");
  return { queued };
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
    message: "Queued — AI is filling out the application",
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
