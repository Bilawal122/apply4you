import { z } from "zod";

/**
 * PRD statuses plus `approved` (explicit review-gate approval) and
 * `submitting` (claimed by a worker; prevents double-pickup).
 */
export const ApplicationStatusSchema = z.enum([
  "draft",
  "needs_review",
  "approved",
  "submitting",
  "submitted",
  "skipped",
  "failed",
  // Worker died mid-submission; a human verifies against the ATS before any
  // retry (DECISIONS.md D3) — never auto-requeued.
  "needs_manual_verification",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationModeSchema = z.enum(["assisted", "auto"]);
export type ApplicationMode = z.infer<typeof ApplicationModeSchema>;

export const SubmitResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("submitted") }),
  z.object({
    outcome: z.literal("failed"),
    reason: z.enum(["captcha", "bot_wall", "form_error", "confirmation_timeout", "navigation_error", "posting_closed"]),
    detail: z.string().optional(),
  }),
]);
export type SubmitResult = z.infer<typeof SubmitResultSchema>;
