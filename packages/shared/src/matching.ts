/**
 * Ranking rules shared by the two places that can produce a match set.
 *
 * Matching normally runs in the worker, which can afford an AI call per job to
 * write the one-line "why". It also has to be able to run inside a web request,
 * because the worker needs Redis and a user whose queue is down would otherwise
 * sit on "matching in progress…" forever with nothing behind it.
 *
 * Those two paths must rank identically — a feed that reorders itself depending
 * on which process happened to build it is worse than no feed. So the scoring
 * lives here, and each caller supplies only its own database access.
 */

import { ukSponsorRelevant } from "./uk.js";

/** How many matches a run writes. */
export const MATCH_LIMIT = 100;

/** How many of the top matches get an AI-written reason (worker path only). */
export const REASONS_FOR_TOP = 40;

/** Added to the vector score when the job title matches a stated preference. */
export const TITLE_BOOST = 8;

/**
 * Added when the user needs sponsorship and the employer holds a licence.
 *
 * Larger than TITLE_BOOST because it is closer to a dealbreaker than a
 * preference: a perfect-fit role at an employer that cannot legally hire you is
 * worth less than a decent one at an employer that can. It is a boost rather
 * than a filter because the register is matched on a normalised company name
 * and can miss — dropping every unmatched employer would quietly hide most of
 * the feed. The auto-queue, which spends the user's application budget without
 * asking, does exclude rather than down-rank.
 */
export const SPONSOR_BOOST = 15;

/**
 * Added when the job's location mentions one the user gave.
 *
 * Between the two existing boosts: a wrong-country job is worse than a
 * wrong-title one (you cannot take it at all) but the signal is less certain
 * than a sponsor licence, because ATS location strings are free text and a
 * blank or "Remote" location is not evidence of anything. So it orders the
 * pool rather than gating it — `match_jobs` guarantees location matches reach
 * the pool, and this decides where they sit.
 */
export const LOCATION_BOOST = 12;

/**
 * Freshness policy (P1-02). Board presence used to be the only liveness
 * signal, which let a June-2025 posting sit in an August-2026 feed at full
 * rank. Age now demotes: postings older than STALE_AFTER_DAYS lose
 * STALE_PENALTY in ranking, and the feed hides anything past
 * FEED_MAX_AGE_DAYS behind an explicit "include older roles" toggle.
 * Anchored on posted_at, falling back to first_seen_at (posted_at is
 * nullable across all four ATSs; first_seen_at is not null by schema).
 */
export const STALE_AFTER_DAYS = 45;
export const FEED_MAX_AGE_DAYS = 90;
/**
 * Between TITLE_BOOST and LOCATION_BOOST: an old posting is likely filled,
 * but ATS date fields are inconsistent enough that age must not be able to
 * bury a strong fit outright.
 */
export const STALE_PENALTY = 10;

export function jobAgeDays(
  postedAt: string | null | undefined,
  firstSeenAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  const anchor = postedAt ?? firstSeenAt;
  if (!anchor) return null;
  const t = new Date(anchor).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / 86_400_000);
}

export function isStaleJob(
  postedAt: string | null | undefined,
  firstSeenAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const age = jobAgeDays(postedAt, firstSeenAt, now);
  return age !== null && age > STALE_AFTER_DAYS;
}

/**
 * Whether a job's location mentions one of the user's preferred locations.
 *
 * Substring, case-insensitive, in that direction on purpose: the preference is
 * short and human ("London", "Manchester") while the job's is long and
 * inconsistent across four ATSs ("London, UK", "London, United Kingdom",
 * "US - San Francisco"). Matching the short inside the long is what makes
 * "London" find all three London spellings.
 *
 * A job with no location cannot match. That is deliberate — an unknown
 * location is not evidence of the right one, and the pool has already
 * guaranteed such jobs are present to be ranked.
 */
export function locationMatches(prefLocations: string[], jobLocation: string | null): boolean {
  if (!jobLocation) return false;
  const haystack = jobLocation.toLowerCase();
  return prefLocations.some((loc) => {
    const needle = loc.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Whether a job title satisfies one of the user's preferred titles.
 *
 * Every token of a preference must appear in the title, so "software engineer"
 * matches "Senior Software Engineer, Platform" but not "Sales Engineer". Tokens
 * of two characters or fewer are dropped — otherwise "IT" or "HR" inside a
 * preference would match on any title containing those letters in a word.
 */
export function titleMatches(prefTitles: string[], jobTitle: string): boolean {
  const title = jobTitle.toLowerCase();
  return prefTitles.some((t) => {
    const tokens = t.toLowerCase().split(/\s+/).filter((tok) => tok.length > 2);
    return tokens.length > 0 && tokens.every((tok) => title.includes(tok));
  });
}

/** Applies the boosts and orders by final score. Pure, so both paths agree. */
export function rankMatches<
  T extends {
    jobId: string;
    score: number;
    title: string;
    sponsorLicensed?: boolean;
    location?: string | null;
    postedAt?: string | null;
    firstSeenAt?: string | null;
  },
>(
  candidates: T[],
  prefs: { titles: string[]; locations?: string[]; needsSponsorship?: boolean },
): { jobId: string; score: number }[] {
  return candidates
    .map(({ jobId, score, title, sponsorLicensed, location, postedAt, firstSeenAt }) => {
      const titleBoost = titleMatches(prefs.titles, title) ? TITLE_BOOST : 0;
      // A UK licence only helps where UK sponsorship can apply: a licensed
      // multinational's Warsaw role must not outrank a licensed London one
      // for a visa-dependent user (P1-01).
      const sponsorBoost =
        prefs.needsSponsorship && sponsorLicensed && ukSponsorRelevant(location ?? null)
          ? SPONSOR_BOOST
          : 0;
      const locationBoost = locationMatches(prefs.locations ?? [], location ?? null)
        ? LOCATION_BOOST
        : 0;
      const stalePenalty = isStaleJob(postedAt ?? null, firstSeenAt ?? null) ? STALE_PENALTY : 0;
      return {
        jobId,
        score: Math.max(0, Math.min(100, score + titleBoost + sponsorBoost + locationBoost - stalePenalty)),
      };
    })
    .sort((a, b) => b.score - a.score);
}
