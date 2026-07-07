/** Plan limits (Stripe wiring deferred; enforced via subscriptions table). */
export const PLANS = {
  free: { applicationsLimit: 10, autoMode: false },
  starter: { applicationsLimit: 50, autoMode: false },
  pro: { applicationsLimit: 200, autoMode: true },
  power: { applicationsLimit: 900, autoMode: true }, // ~30/day
} as const;

export type PlanId = keyof typeof PLANS;

export const DEFAULT_DAILY_CAP = 25;
export const MAX_DAILY_CAP = 100;

/** Queue names shared between web (producer) and worker (consumer). */
export const QUEUES = {
  sourcing: "sourcing",
  embedding: "embedding",
  matching: "matching",
  resolve: "resolve",
  submitGreenhouse: "submit:greenhouse",
  submitLever: "submit:lever",
  submitAshby: "submit:ashby",
  submitWorkable: "submit:workable",
} as const;

export const submitQueueFor = (atsType: string): string => `submit:${atsType}`;

/** FR-18: phrasing banned from generated text. */
export const BANNED_PHRASES = [
  "passionate about",
  "leverage",
  "leveraging",
  "excited to",
  "I am thrilled",
  "dynamic individual",
] as const;
