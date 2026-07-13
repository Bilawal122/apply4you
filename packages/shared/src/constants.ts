/** Plan limits (Stripe wiring deferred; enforced via subscriptions table). */
export const PLANS = {
  free: { applicationsLimit: 10, autoMode: false },
  starter: { applicationsLimit: 50, autoMode: false },
  pro: { applicationsLimit: 200, autoMode: true },
  power: { applicationsLimit: 900, autoMode: true }, // ~30/day
} as const;

export type PlanId = keyof typeof PLANS;

/** Length of a plan usage window (matches the subscriptions.period_end default of now()+30 days). */
export const USAGE_PERIOD_DAYS = 30;

/**
 * The current usage window as a rolling 30-day period anchored at the
 * subscription's `period_start`. It advances automatically every 30 days, so
 * plan usage (counted as submitted applications since `start`) resets with no
 * cron/reset job — the fix for applications_used never resetting. When Stripe
 * lands, period_start/period_end become the real billing period and this still
 * holds. `now` is injectable for testing.
 */
export function currentUsagePeriod(
  periodStart: string | Date,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const periodMs = USAGE_PERIOD_DAYS * 86_400_000;
  const anchorMs = new Date(periodStart).getTime();
  const nowMs = now.getTime();
  // Invalid or future anchor: treat it (or now) as the window start.
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) {
    const start = Number.isFinite(anchorMs) ? new Date(anchorMs) : now;
    return { start, end: new Date(start.getTime() + periodMs) };
  }
  const windowsPassed = Math.floor((nowMs - anchorMs) / periodMs);
  const startMs = anchorMs + windowsPassed * periodMs;
  return { start: new Date(startMs), end: new Date(startMs + periodMs) };
}

export const DEFAULT_DAILY_CAP = 25;
export const MAX_DAILY_CAP = 100;

/** Queue names shared between web (producer) and worker (consumer). */
export const QUEUES = {
  sourcing: "sourcing",
  embedding: "embedding",
  // Separate from `embedding`: profile embeds must not queue behind thousands
  // of job embeds — signup -> first matches should take seconds.
  profileEmbedding: "profile-embedding",
  matching: "matching",
  resolve: "resolve",
  submitGreenhouse: "submit-greenhouse",
  submitLever: "submit-lever",
  submitAshby: "submit-ashby",
  submitWorkable: "submit-workable",
} as const;

// BullMQ forbids ":" in queue names.
export const submitQueueFor = (atsType: string): string => `submit-${atsType}`;

/** FR-18: phrasing banned from generated text. */
export const BANNED_PHRASES = [
  "passionate about",
  "leverage",
  "leveraging",
  "excited to",
  "I am thrilled",
  "dynamic individual",
] as const;
