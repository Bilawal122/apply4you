import type { Profile, Preferences } from "@apply4you/shared";
import { ProfileSchema, PreferencesSchema } from "@apply4you/shared";
import { supabaseAdmin } from "./supabase.js";

/** Loads and validates a user's profile + preferences (worker-side, service role). */
export async function loadProfileAndPrefs(
  userId: string,
): Promise<{
  profile: Profile;
  preferences: Preferences;
  /** Answer Library (task #31): user-authored answers a CV can't contain. */
  answerLibrary: Record<string, string>;
  resumeStoragePath: string | null;
  resumeFilename: string | null;
}> {
  const db = supabaseAdmin();

  const [{ data: p }, { data: prefs }] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).single(),
    db.from("preferences").select("*").eq("user_id", userId).single(),
  ]);
  if (!p) throw new Error(`profile not found for ${userId}`);
  if (!prefs) throw new Error(`preferences not found for ${userId}`);

  const profile = ProfileSchema.parse({
    firstName: p.first_name ?? "",
    lastName: p.last_name ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    location: p.location ?? "",
    links: p.links ?? {},
    workAuthorization: p.work_authorization ?? "",
    workHistory: p.work_history ?? [],
    projects: p.projects ?? [],
    education: p.education ?? [],
    skills: p.skills ?? [],
    summary: p.summary ?? "",
    additionalInfo: p.additional_info ?? "",
  });

  const preferences = PreferencesSchema.parse({
    titles: prefs.titles,
    locations: prefs.locations,
    workModel: prefs.work_model,
    salaryFloor: prefs.salary_floor,
    seniority: prefs.seniority,
    industries: prefs.industries,
    excludedCompanies: prefs.excluded_companies,
    excludedKeywords: prefs.excluded_keywords,
    needsSponsorship: prefs.needs_sponsorship ?? false,
    dailyCap: prefs.daily_cap,
    autoSubmit: prefs.auto_submit,
  });

  return {
    profile,
    preferences,
    answerLibrary: (p.answer_library ?? {}) as Record<string, string>,
    resumeStoragePath: p.resume_storage_path,
    resumeFilename: p.resume_filename,
  };
}
