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
  T extends { jobId: string; score: number; title: string; sponsorLicensed?: boolean },
>(
  candidates: T[],
  prefs: { titles: string[]; needsSponsorship?: boolean },
): { jobId: string; score: number }[] {
  return candidates
    .map(({ jobId, score, title, sponsorLicensed }) => {
      const titleBoost = titleMatches(prefs.titles, title) ? TITLE_BOOST : 0;
      const sponsorBoost = prefs.needsSponsorship && sponsorLicensed ? SPONSOR_BOOST : 0;
      return { jobId, score: Math.min(100, score + titleBoost + sponsorBoost) };
    })
    .sort((a, b) => b.score - a.score);
}
