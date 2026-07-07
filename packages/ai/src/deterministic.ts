import type { Field, Profile, ResolvedValues } from "@apply4you/shared";

/**
 * FR-12: resolve fields whose labels map to known profile attributes without
 * an LLM call. Typically covers 50-70% of a form's fields.
 */

type Extractor = (profile: Profile) => string | null;

const val = (s: string | undefined | null): string | null => (s && s.trim() ? s.trim() : null);

const MATCHERS: Array<{ pattern: RegExp; extract: Extractor }> = [
  { pattern: /\b(first[\s_-]?name|given[\s_-]?name)\b/i, extract: (p) => val(p.firstName) },
  { pattern: /\b(last[\s_-]?name|family[\s_-]?name|surname)\b/i, extract: (p) => val(p.lastName) },
  { pattern: /\b(full[\s_-]?name|^name$|your[\s_-]?name)\b/i, extract: (p) => val(`${p.firstName} ${p.lastName}`) },
  { pattern: /\b(e-?mail)\b/i, extract: (p) => val(p.email) },
  { pattern: /\b(phone|mobile|cell)\b/i, extract: (p) => val(p.phone) },
  { pattern: /\b(location|city|current[\s_-]?location|where.*(based|located))\b/i, extract: (p) => val(p.location) },
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

    if (!matcher) {
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
