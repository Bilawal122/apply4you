import type { Field } from "./schemas/field.js";
import type { Profile } from "./schemas/profile.js";

/**
 * Structural backstops for answers that a prompt instruction alone did not stop.
 *
 * The field-resolution prompt has always said "Work authorization / visa
 * sponsorship questions: answer ONLY if the profile's workAuthorization field
 * clearly determines the answer; otherwise null." It was ignored 9 times out of
 * 19 in production, against a profile whose workAuthorization is an empty
 * string — telling Stripe, Sierra, Scale AI, ClickHouse, Cohere and Amber
 * Electric, in writing, that the candidate did not need sponsorship.
 *
 * Every other answer class in this codebase has a hard check: selects are
 * matched against the live option list, the tailored CV is indices rather than
 * prose, deterministic matches are pattern-bound. These two classes had only
 * prompt wording. Now they do not.
 */

/**
 * Questions about the right to work, visa status, or sponsorship.
 *
 * Deliberately broad: a false positive costs one amber "needs you" field, a
 * false negative is a machine-authored misstatement about a person's
 * immigration status on a real job application.
 */
const WORK_AUTHORIZATION_PATTERNS: RegExp[] = [
  /\bsponsor(ship|ed|ing)?\b/i,
  /\bvisa\b/i,
  /\bwork\s*(permit|authoriz|authoris)/i,
  /\b(legally\s+)?(authoriz|authoris)ed\s+to\s+work\b/i,
  /\bright\s+to\s+work\b/i,
  /\beligible\s+to\s+work\b/i,
  /\bwork\s+eligibilit/i,
  /\bimmigration\s+status\b/i,
  /\b(h-?1b|opt|cpt|ead|tier\s*2|skilled\s+worker)\b/i,
];

export function isWorkAuthorizationField(id: string, label: string): boolean {
  const haystack = `${id} ${label}`;
  return WORK_AUTHORIZATION_PATTERNS.some((p) => p.test(haystack));
}

/**
 * A model explaining that it cannot answer, written into the answer box.
 *
 * ClickHouse would have received, as the candidate's answer to a required
 * technical question: "The profile does not contain information about preferred
 * state management approaches in React or the reasoning behind them." Because
 * the field was *filled*, the required-field pre-flight saw nothing wrong.
 *
 * Kept narrow on purpose — these patterns must not catch a genuine answer that
 * happens to use the word "profile" or a negation.
 */
const REFUSAL_PATTERNS: RegExp[] = [
  /\b(the\s+)?(candidate'?s?\s+|their\s+|this\s+)?profile\s+(does\s*n[o']t|doesn't|did\s*not|does\s+not)\s+(contain|include|specify|mention|state|provide|list)/i,
  /\bnot\s+(specified|provided|mentioned|listed|stated|available|included)\s+in\s+(the|their|this|his|her)\s+profile\b/i,
  /\bno\s+information\s+(about|on|regarding)\b[^.]{0,80}\bprofile\b/i,
  /\bbased\s+on\s+the\s+(provided\s+)?profile,?\s+(there\s+is\s+no|i\s+cannot|it\s+is\s+not\s+possible)/i,
  /\bas\s+an\s+ai\b/i,
  /\bi\s+(do\s*n[o']t|don't|do\s+not)\s+have\s+(access\s+to|enough|sufficient|any)\s+information/i,
  /\b(cannot|can'?t|unable\s+to)\s+(determine|answer|provide|generate)\b[^.]{0,80}\bprofile\b/i,
];

export function looksLikeRefusal(value: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(value));
}

/**
 * The last gate before a machine-written value becomes an answer an employer
 * reads. Returns the value, or null to park the field for the human.
 *
 * Applied AFTER postValidate, so a select answer has already been canonicalized
 * against the live option list — `"No"` is a perfectly legal option, which is
 * exactly why option-validation could never have caught the visa answers.
 */
export function groundAnswer(profile: Profile, field: Field, value: string | null): string | null {
  if (value === null) return null;

  // Right-to-work claims need an explicit profile fact behind them. Nothing
  // else in the profile can imply one: a UK location does not establish a
  // right to work, and neither does a UK employment history.
  if (isWorkAuthorizationField(field.id, field.label) && !profile.workAuthorization.trim()) {
    return null;
  }

  if (looksLikeRefusal(value)) return null;

  return value;
}
