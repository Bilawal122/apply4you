"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProfileSchema, PreferencesSchema } from "@apply4you/shared";
import { deriveSummary } from "@apply4you/ai";
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

  // FR-4: derive the reusable summary once — only when missing or explicitly refreshed.
  if (!profile.summary.trim()) {
    try {
      profile.summary = await deriveSummary(profile);
    } catch {
      // Summary derivation is best-effort; profile save must not fail on it.
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ ...profileToRow(profile), updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // Profile changed -> re-embed -> re-match (worker chain).
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

  if (formData.get("redirectTo") === "feed") redirect("/feed");
  return { ok: true };
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
