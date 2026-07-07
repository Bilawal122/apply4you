import { z } from "zod";

export const AtsTypeSchema = z.enum(["greenhouse", "lever", "ashby", "workable"]);
export type AtsType = z.infer<typeof AtsTypeSchema>;

/** Output of an adapter's pollJobs(): a posting normalized from the ATS public API. */
export const NormalizedJobSchema = z.object({
  atsType: AtsTypeSchema,
  externalId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  description: z.string(), // plain text, HTML stripped
  applyUrl: z.string().url(),
  requiresLogin: z.boolean(),
  postedAt: z.string().nullable(), // ISO timestamp
  raw: z.unknown(),
});
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;
