import { z } from "zod";

export const WorkHistoryEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  start: z.string(), // ISO date (YYYY-MM or YYYY-MM-DD)
  end: z.union([z.string(), z.literal("present")]),
  bullets: z.array(z.string()),
});

export const EducationEntrySchema = z.object({
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string(),
});

export const ProfileLinksSchema = z.object({
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
});

export const ProfileSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: ProfileLinksSchema,
  workAuthorization: z.string(),
  workHistory: z.array(WorkHistoryEntrySchema),
  education: z.array(EducationEntrySchema),
  skills: z.array(z.string()),
  summary: z.string(),
  /** User-authored context the AI can't get from a CV: goals, constraints,
   *  things to always mention. Fed into every prompt that stringifies the
   *  whole profile (field resolution, cover letter) — never inferred from
   *  the resume parse, so it's excluded from ParsedResumeSchema below. */
  additionalInfo: z.string(),
});

/** What the resume parser is allowed to return: everything optional/empty when absent. */
export const ParsedResumeSchema = ProfileSchema.omit({ summary: true, additionalInfo: true }).partial();

export type WorkHistoryEntry = z.infer<typeof WorkHistoryEntrySchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type ProfileLinks = z.infer<typeof ProfileLinksSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;
