import type { NormalizedJob } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import { stripHtml } from "../html.js";
import type { PollOptions } from "../types.js";

/** Shape verified against boards-api.greenhouse.io 2026-07. */
interface GreenhouseJob {
  id: number;
  title: string;
  company_name?: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string; // HTML with escaped entities
  first_published?: string;
  updated_at?: string;
}

export async function pollGreenhouse(slug: string, opts?: PollOptions): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  );

  return data.jobs.map((job) => ({
    atsType: "greenhouse" as const,
    externalId: String(job.id),
    title: job.title,
    company: job.company_name ?? opts?.companyName ?? slug,
    location: job.location?.name ?? null,
    description: job.content ? stripHtml(job.content) : "",
    applyUrl: job.absolute_url,
    requiresLogin: false,
    postedAt: job.first_published ?? job.updated_at ?? null,
    raw: job,
  }));
}
