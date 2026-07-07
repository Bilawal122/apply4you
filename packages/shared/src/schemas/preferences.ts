import { z } from "zod";

export const WorkModelSchema = z.enum(["remote", "hybrid", "onsite"]);

export const PreferencesSchema = z.object({
  titles: z.array(z.string()),
  locations: z.array(z.string()),
  workModel: z.array(WorkModelSchema),
  salaryFloor: z.number().int().nonnegative().nullable(),
  seniority: z.array(z.string()),
  industries: z.array(z.string()),
  excludedCompanies: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
  dailyCap: z.number().int().positive().max(100),
  autoSubmit: z.boolean(),
});

export type WorkModel = z.infer<typeof WorkModelSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
