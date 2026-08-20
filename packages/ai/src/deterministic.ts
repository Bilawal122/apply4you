import type { Field, Profile, ResolvedValues } from "@apply4you/shared";

/**
 * FR-12: resolve fields whose labels map to known profile attributes without
 * an LLM call. Typically covers 50-70% of a form's fields.
 */

type Extractor = (profile: Profile) => string | null;

const val = (s: string | undefined | null): string | null => (s && s.trim() ? s.trim() : null);

/**
 * Labels that ask about somebody OTHER than the candidate.
 *
 * A near-miss here is worse than no answer at all: "Reference email" matched
 * `/\be-?mail\b/` and shipped the candidate's own address, and "Emergency
 * contact phone" shipped their own number — each stamped `answer_sources =
 * "profile"`, the strongest provenance label the product has. FR-14 says an
 * uncertain field resolves to null, so these fall through to the LLM (which
 * runs postValidate) or to the human, never to a confident wrong answer.
 */
const NOT_THE_CANDIDATE =
  /\b(references?|referees?|emergency|next[\s_-]?of[\s_-]?kin|guardian|parent|spouse|partner|manager|supervisor|recruiter|colleagues?|co-?workers?|friend|relative|employers?|previous|former)\b/i;

/**
 * Asks what the candidate WANTS, not what is true of them today. The profile
 * holds their current location; "Which city would you prefer to work from?"
 * is a preference the profile cannot answer.
 */
const A_PREFERENCE_NOT_A_FACT = /\b(prefer(red|ence)?|desired|willing|relocat\w*|office)\b/i;

const MATCHERS: Array<{ pattern: RegExp; exclude?: RegExp; extract: Extractor }> = [
  { pattern: /\b(first[\s_-]?name|given[\s_-]?name)\b/i, extract: (p) => val(p.firstName) },
  { pattern: /\b(last[\s_-]?name|family[\s_-]?name|surname)\b/i, extract: (p) => val(p.lastName) },
  // Both halves or neither — a missing surname must not ship a half-name.
  {
    pattern: /\b(full[\s_-]?name|^name$|your[\s_-]?name)\b/i,
    extract: (p) => (val(p.firstName) && val(p.lastName) ? `${p.firstName.trim()} ${p.lastName.trim()}` : null),
  },
  { pattern: /\b(e-?mail)\b/i, extract: (p) => val(p.email) },
  { pattern: /\b(phone|mobile|cell)\b/i, extract: (p) => val(p.phone) },
  {
    pattern: /\b(location|city|current[\s_-]?location|where.*(based|located))\b/i,
    exclude: A_PREFERENCE_NOT_A_FACT,
    extract: (p) => val(p.location),
  },
  { pattern: /\blinked[\s_-]?in\b/i, extract: (p) => val(p.links.linkedin) },
  { pattern: /\bgit[\s_-]?hub\b/i, extract: (p) => val(p.links.github) },
  { pattern: /\b(portfolio|personal[\s_-]?(web)?site|website[\s_-]?url)\b/i, extract: (p) => val(p.links.portfolio) },
];

/**
 * Resolve what we can deterministically. Returns resolved values plus the
 * fields still needing LLM resolution. File fields are excluded entirely —
 * the resume upload is handled by the fill layer, not value resolution.
 */
export function resolveDeterministic(
  fields: Field[],
  profile: Profile,
): { resolved: ResolvedValues; remaining: Field[] } {
  const resolved: ResolvedValues = {};
  const remaining: Field[] = [];

  for (const field of fields) {
    if (field.type === "file") continue;

    const haystack = `${field.id} ${field.label}`;
    const matcher = MATCHERS.find((m) => m.pattern.test(haystack));

    // No match, or the label is about someone else / about a preference: hand
    // it on rather than guessing. FR-14 — silence beats a confident mistake.
    if (!matcher || NOT_THE_CANDIDATE.test(haystack) || matcher.exclude?.test(haystack)) {
      remaining.push(field);
      continue;
    }

    const value = matcher.extract(profile);
    // A select's options may not contain our exact value — let the LLM pick.
    if (value === null || (field.options && !field.options.includes(value))) {
      remaining.push(field);
      continue;
    }
    resolved[field.id] = field.maxLength ? value.slice(0, field.maxLength) : value;
  }

  return { resolved, remaining };
}
