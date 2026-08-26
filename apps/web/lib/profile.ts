import { ProfileSchema, PreferencesSchema, type Profile, type Preferences } from "@apply4you/shared";

/** Mapping between the camelCase domain shape and snake_case DB rows. */

export type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: Record<string, string> | null;
  work_authorization: string | null;
  work_history: unknown;
  projects: unknown;
  education: unknown;
  skills: string[] | null;
  resume_storage_path: string | null;
  resume_filename: string | null;
  summary: string | null;
  additional_info: string | null;
};

export function rowToProfile(row: ProfileRow): Profile {
  return ProfileSchema.parse({
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    location: row.location ?? "",
    links: row.links ?? {},
    workAuthorization: row.work_authorization ?? "",
    workHistory: row.work_history ?? [],
    projects: (row.projects ?? []) as Profile["projects"],
    education: row.education ?? [],
    skills: row.skills ?? [],
    summary: row.summary ?? "",
    additionalInfo: row.additional_info ?? "",
  });
}

export function profileToRow(profile: Profile): Omit<ProfileRow, "user_id" | "resume_storage_path" | "resume_filename"> {
  return {
    first_name: profile.firstName,
    last_name: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    links: Object.fromEntries(Object.entries(profile.links).filter(([, v]) => v)),
    work_authorization: profile.workAuthorization,
    work_history: profile.workHistory,
    projects: profile.projects,
    education: profile.education,
    skills: profile.skills,
    summary: profile.summary,
    additional_info: profile.additionalInfo,
  };
}

export type PreferencesRow = {
  user_id: string;
  titles: string[];
  locations: string[];
  work_model: string[];
  salary_floor: number | null;
  seniority: string[];
  industries: string[];
  excluded_companies: string[];
  excluded_keywords: string[];
  needs_sponsorship: boolean;
  daily_cap: number;
  auto_submit: boolean;
};

export function rowToPreferences(row: PreferencesRow): Preferences {
  return PreferencesSchema.parse({
    titles: row.titles,
    locations: row.locations,
    workModel: row.work_model,
    salaryFloor: row.salary_floor,
    seniority: row.seniority,
    industries: row.industries,
    excludedCompanies: row.excluded_companies,
    excludedKeywords: row.excluded_keywords,
    needsSponsorship: row.needs_sponsorship ?? false,
    dailyCap: row.daily_cap,
    autoSubmit: row.auto_submit,
  });
}

export function preferencesToRow(prefs: Preferences): Omit<PreferencesRow, "user_id"> {
  return {
    titles: prefs.titles,
    locations: prefs.locations,
    work_model: prefs.workModel,
    salary_floor: prefs.salaryFloor,
    seniority: prefs.seniority,
    industries: prefs.industries,
    excluded_companies: prefs.excludedCompanies,
    excluded_keywords: prefs.excludedKeywords,
    needs_sponsorship: prefs.needsSponsorship,
    daily_cap: prefs.dailyCap,
    auto_submit: prefs.autoSubmit,
  };
}
