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

/**
 * EEOC / demographic / special-category fields are NEVER AUTO-filled, on any
 * ATS, for anyone (DECISIONS.md D3): resolution must not generate values for
 * them (deterministic or LLM). Voluntary self-identification is the
 * applicant's decision alone — an answer the user explicitly types in review
 * IS deliverable; one the machine invented is not.
 *
 * Matching is done on a normalized form (camelCase/underscores/brackets ->
 * spaces, lowercased) so `genderIdentity`, `veteran_status`, and
 * "Voluntary Self-Identification of Disability" all match. Prefix tokens use
 * \w* so ethnicity/ethnicities/disabilities match; exact tokens (race) keep
 * word boundaries so trace/embrace don't.
 */
const DEMOGRAPHIC_TOKENS =
  /\b(eeoc?|gender\w*|race|racial|ethnic\w*|hispanic\w*|latino|latina|latinx|veteran\w*|disabilit\w*|disabled|sexual orientation|sexualit\w*|lgbtq\w*|transgender\w*|pronouns?|religio\w*|nationalit\w*|date of birth|self.?identif\w*|demographic\w*)\b/;

function normalizeFieldText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase -> spaced
    .replace(/[_\-[\].]+/g, " ")
    .toLowerCase();
}

export function isDemographicField(id: string, label: string): boolean {
  return (
    /^eeo\[/.test(id) ||
    DEMOGRAPHIC_TOKENS.test(normalizeFieldText(id)) ||
    DEMOGRAPHIC_TOKENS.test(normalizeFieldText(label))
  );
}

/**
 * Fields resolution never writes a value for.
 *
 * This MUST be the only definition. It used to exist only inside the worker's
 * resolver while the web save action carried its own narrower copy (files
 * only), and the two disagreeing was a P0: Greenhouse's Resume question emits
 * BOTH `{id:"resume", type:"file"}` and `{id:"resume_text", type:"textarea"}`
 * and copies `required:true` onto both. The resolver skipped `resume_text`;
 * the save action counted it as an unanswered required field, flipped the
 * application to `needs_review`, and approval then refused with "answer the
 * required fields first" — for a field the review UI deliberately hides. The
 * application could never be approved and the header still read "ready to
 * send". Both callers now share this predicate.
 */
export function isExcludedFromResolution(field: { id: string; label: string; type: string }): boolean {
  if (field.type === "file") return true; // the upload is handled at fill time
  if (field.id === "resume_text") return true; // Greenhouse paste-resume textarea
  // EEOC/demographic/special-category: never auto-filled (DECISIONS.md D3).
  return isDemographicField(field.id, field.label);
}

/**
 * Field types the fill layer can reliably drive on a live form. A REQUIRED
 * field outside this set can never be auto-submitted — approval must refuse
 * it rather than let the submission fail on the employer's validation.
 */
export const FILLABLE_FIELD_TYPES = new Set<string>([
  "text",
  "textarea",
  "select",
  "multiselect",
  "radio",
  "email",
  "phone",
  "number",
  "file",
]);

/**
 * Support / data-request contact. Env-overridable so a mailbox change is a
 * deploy, not a code change; the default matches the NOTIFY_FROM_EMAIL
 * domain. Published on /privacy and /terms and in the sourcing User-Agent,
 * so it must be a real, monitored mailbox before launch (see
 * PRODUCTION-READINESS.md P1-06).
 */
export const SUPPORT_EMAIL: string =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? process.env.SUPPORT_EMAIL ?? "support@apply4you.app";

/**
 * Worker heartbeat (P0-01/P1-04). The worker refreshes this Redis key every
 * WORKER_HEARTBEAT_INTERVAL_MS with a TTL of WORKER_HEARTBEAT_TTL_SECONDS;
 * the web app reads it to distinguish "Redis reachable" from "worker actually
 * processing" — the incident shape that used to look green. A beat older than
 * WORKER_HEARTBEAT_STALE_MS (or an expired key) means nothing is consuming.
 */
export const WORKER_HEARTBEAT_KEY = "apply4you:worker:heartbeat";
export const WORKER_HEARTBEAT_INTERVAL_MS = 60_000;
export const WORKER_HEARTBEAT_TTL_SECONDS = 180;
export const WORKER_HEARTBEAT_STALE_MS = 3 * 60_000;

/**
 * Backstop for a draft the resolve pipeline could not fill even though the
 * worker is alive (P0-01): stranded-draft re-enqueue runs every 5 minutes and
 * each resolve gets 3 attempts, so a row still unfilled after this long is
 * genuinely wedged and is failed with a reason instead of reading "still
 * filling out" forever. Worker-down drafts are deliberately NOT failed — they
 * self-heal via re-enqueue when the worker returns, and the UI says so.
 */
export const DRAFT_ABANDONED_MS = 24 * 60 * 60 * 1000;
