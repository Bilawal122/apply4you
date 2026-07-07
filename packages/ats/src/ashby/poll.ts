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
}

export async function pollAshby(slug: string, opts?: PollOptions): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
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
      raw: job,
    }));
}
