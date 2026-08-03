/**
 * Sponsor-register helpers (tasks #27/#41). normalizeCompanyName MUST stay in
 * lockstep with the SQL normalize_company_name() from migration 0011 — the
 * checker computes keys client-side that are looked up against DB-computed
 * keys.
 */

const SUFFIXES = new Set([
  "ltd", "limited", "plc", "llp", "lp", "inc", "incorporated", "corp", "corporation",
  "co", "company", "uk", "gb", "group", "holdings", "holding", "international",
  "technologies", "technology", "tech", "labs", "lab", "systems", "software",
  "solutions", "services", "ventures", "global", "hq",
]);

export function normalizeCompanyName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(" ");
}

export interface SponsorVerdict {
  licensed: boolean;
  org_name?: string;
  routes?: string[];
  ratings?: string[];
  register_date?: string;
}

export const REGISTER_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";
