import { z } from "zod";

/**
 * Review-quality instrumentation (IMPROVEMENTS C2, required by DECISIONS.md D6).
 *
 * D6 tracks "median time-in-review and edit-rate on AI free text" and fixes a
 * hard line: **"<10s median review is a red flag equal to a failed
 * submission."** The review gate is the product, so a gate that everyone clicks
 * through in three seconds is a failure mode we have to be able to SEE, not a
 * success we get to claim.
 *
 * Captured at approval, because that is the only moment where "did a human
 * actually read this?" has an answer.
 */

export const ReviewMetricsSchema = z.object({
  /** How many times the card was expanded. 0 means it was never opened. */
  openedCount: z.number().int().nonnegative(),
  /** Seconds the card spent expanded, accumulated across opens. */
  seconds: z.number().nonnegative(),
  /** Distinct fields the user changed before approving. */
  fieldsEdited: z.number().int().nonnegative(),
  /** Of those, ones the machine had written — the edit-rate D6 asks for. */
  aiFieldsEdited: z.number().int().nonnegative(),
  coverLetterEdited: z.boolean(),
  /** True when approved in bulk, i.e. the card was never opened at all. */
  bulk: z.boolean(),
});

export type ReviewMetrics = z.infer<typeof ReviewMetricsSchema>;

/** D6's threshold, in one place so the UI and any report cannot disagree. */
export const REVIEW_RED_FLAG_SECONDS = 10;

export interface ReviewSummary {
  /** Approvals that carry metrics. Older ones predate the instrumentation. */
  sample: number;
  medianSeconds: number;
  /** Share of approvals where the card was never opened (0-1). */
  unopenedRate: number;
  /** Share of approvals where the user changed something the AI wrote (0-1). */
  editRate: number;
  /** True when the median breaches D6's line and the sample is worth believing. */
  redFlag: boolean;
}

/**
 * Summarises a set of approvals.
 *
 * Bulk approvals count as 0 seconds rather than being excluded — an unreviewed
 * approval is the single most important observation about review quality, and
 * dropping it would flatter the median into meaninglessness.
 */
export function summariseReviews(metrics: ReviewMetrics[]): ReviewSummary {
  if (metrics.length === 0) {
    return { sample: 0, medianSeconds: 0, unopenedRate: 0, editRate: 0, redFlag: false };
  }

  const seconds = metrics.map((m) => m.seconds).sort((a, b) => a - b);
  const mid = Math.floor(seconds.length / 2);
  const medianSeconds =
    seconds.length % 2 === 0 ? (seconds[mid - 1]! + seconds[mid]!) / 2 : seconds[mid]!;

  const unopened = metrics.filter((m) => m.openedCount === 0).length;
  const edited = metrics.filter((m) => m.aiFieldsEdited > 0 || m.coverLetterEdited).length;

  return {
    sample: metrics.length,
    medianSeconds: Math.round(medianSeconds),
    unopenedRate: unopened / metrics.length,
    editRate: edited / metrics.length,
    // A handful of approvals can't establish a median worth acting on; D6's
    // gate talks about 20-25 genuine submissions, so hold the flag until there
    // is enough to mean something.
    redFlag: metrics.length >= 5 && medianSeconds < REVIEW_RED_FLAG_SECONDS,
  };
}
