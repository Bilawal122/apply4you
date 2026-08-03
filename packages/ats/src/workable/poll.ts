import type { NormalizedJob } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import { stripHtml } from "../html.js";
import type { PollOptions } from "../types.js";

/** Shapes verified against apply.workable.com widget/v2 APIs 2026-07. */
interface WorkableListJob {
  title: string;
  shortcode: string;
  code?: string;
  url: string; // https://apply.workable.com/j/{shortcode}
  application_url?: string;
  published_on?: string; // YYYY-MM-DD
  city?: string;
  state?: string;
  country?: string;
  telecommuting?: boolean;
  department?: string;
}

interface WorkableDetailJob {
  description?: string; // HTML
  requirements?: string; // HTML
  benefits?: string; // HTML
}

export async function pollWorkable(slug: string, opts?: PollOptions): Promise<NormalizedJob[]> {
  const data = await fetchJson<{ name?: string; jobs: WorkableListJob[] }>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
  );

  return data.jobs.map((job) => {
    const location = [job.city, job.state, job.country].filter(Boolean).join(", ");
    return {
      atsType: "workable" as const,
      externalId: job.shortcode,
      title: job.title,
      company: data.name ?? opts?.companyName ?? slug,
      location: location || (job.telecommuting ? "Remote" : null),
      description: "", // list endpoint has no description — enrichWorkableJob fills it for new jobs
      applyUrl: `https://apply.workable.com/${slug}/j/${job.shortcode}/`,
      requiresLogin: false,
      postedAt: job.published_on ? `${job.published_on}T00:00:00Z` : null,
      // Workable's widget endpoint carries no compensation field.
      salary: null,
      raw: job,
    };
  });
}

/** Called only for jobs not yet in the DB — one extra request per new job. */
export async function enrichWorkableJob(slug: string, job: NormalizedJob): Promise<NormalizedJob> {
  const detail = await fetchJson<WorkableDetailJob>(
    `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(job.externalId)}`,
  );
  const description = [detail.description, detail.requirements, detail.benefits]
    .filter(Boolean)
    .map((html) => stripHtml(html!))
    .join("\n\n");
  return { ...job, description };
}
