import type { NormalizedJob } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import type { PollOptions } from "../types.js";

/** Shape verified against api.ashbyhq.com posting-api 2026-07. */
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  employmentType?: string;
  workplaceType?: string;
  /**
   * Present only with ?includeCompensation=true, and only when the employer
   * opted in. Verified live 2026-08: Ramp 116/122 postings carry a summary,
   * Replit 78/89, Vanta 59/98 — Notion and Linear publish none.
   */
  compensation?: {
    scrapeableCompensationSalarySummary?: string | null;
    compensationTierSummary?: string | null;
    compensationTiers?: Array<{
      components?: Array<{
        compensationType?: string;
        interval?: string;
        currencyCode?: string | null;
        minValue?: number | null;
        maxValue?: number | null;
      }>;
    }>;
  };
}

/**
 * Ashby intervals arrive as "1 YEAR" / "1 HOUR" / "NONE" (verified live), so
 * the unit is extracted rather than lowercased — passing "1 year" straight
 * through missed the formatter's period map and dropped the "/yr" suffix.
 */
function ashbyPeriod(interval?: string): string | null {
  if (!interval) return null;
  const m = /(year|month|week|day|hour)/i.exec(interval);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Prefers the structured salary component; falls back to the employer's own
 * summary string. Equity-only components carry no numbers and are skipped for
 * the range but leave the summary intact.
 */
function ashbySalary(job: AshbyJob): NormalizedJob["salary"] {
  const comp = job.compensation;
  if (!comp) return null;

  const summary =
    comp.scrapeableCompensationSalarySummary?.trim() || comp.compensationTierSummary?.trim() || null;

  const salaryComponent = comp.compensationTiers
    ?.flatMap((t) => t.components ?? [])
    .find((c) => (c.minValue != null || c.maxValue != null) && c.compensationType !== "EquityPercentage");

  if (!salaryComponent && !summary) return null;

  return {
    min: salaryComponent?.minValue ?? null,
    max: salaryComponent?.maxValue ?? null,
    currency: salaryComponent?.currencyCode ?? null,
    period: ashbyPeriod(salaryComponent?.interval),
    summary,
    source: "ashby.compensation",
  };
}

export async function pollAshby(slug: string, opts?: PollOptions): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );

  return data.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => ({
      atsType: "ashby" as const,
      externalId: job.id,
      title: job.title,
      company: opts?.companyName ?? slug,
      location: job.location ?? (job.isRemote ? "Remote" : null),
      description: job.descriptionPlain ?? "",
      applyUrl: job.applyUrl ?? `${job.jobUrl}/application`,
      requiresLogin: false,
      postedAt: job.publishedAt ?? null,
      salary: ashbySalary(job),
      raw: job,
    }));
}
