import { z } from "zod";

export const AtsTypeSchema = z.enum(["greenhouse", "lever", "ashby", "workable"]);
export type AtsType = z.infer<typeof AtsTypeSchema>;

/**
 * Employer-published compensation, ONLY as the ATS structured it.
 *
 * Never parsed out of description prose and never estimated. Measured across
 * the four sources (2026-08-04): Lever exposes `salaryRange {min,max,currency,
 * interval}`; Ashby exposes a `compensation` object when the employer opts in
 * (e.g. Ramp 116/122 postings, Replit 78/89, but Notion and Linear publish
 * none); Greenhouse exposes nothing on either the list or the single-job
 * endpoint; Workable exposes nothing on the widget endpoint.
 *
 * So roughly half the index can never carry a figure. That is a fact to state
 * plainly in the UI, not a gap to fill with a guess — an invented salary is
 * the most damaging possible number to get wrong.
 */
export const SalarySchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  /** Normalised: year | month | week | day | hour. */
  period: z.string().nullable(),
  /** The employer's own wording, kept verbatim for display when present. */
  summary: z.string().nullable(),
  /** Which ATS field this came from, so the claim is always traceable. */
  source: z.string(),
});
export type Salary = z.infer<typeof SalarySchema>;

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
  /** null when the employer did not publish one — the common case. */
  salary: SalarySchema.nullable(),
  raw: z.unknown(),
});
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;
