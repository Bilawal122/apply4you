import type { NormalizedJob } from "@apply4you/shared";
import { AtsHttpError, fetchJson } from "../fetch.js";
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

/**
 * Greenhouse serves EU-data-residency boards from a separate host, and the
 * global one 404s for them.
 *
 * That matters here more than it looks: choosing EU residency is a GDPR
 * decision, so the boards behind this host skew heavily to UK and European
 * employers — exactly the supply this product is short of. Several UK boards
 * were found live on `job-boards.eu.greenhouse.io` while returning 404 on the
 * global host, and the poller would have deactivated every one of them as
 * "not found" (source-poll.ts treats 404 as a dead board).
 *
 * Ordered global-first because most boards are there and mirroring is common
 * (TrueLayer and SumUp answer on both), so the fallback is rare in practice.
 */
const GREENHOUSE_HOSTS = ["boards-api.greenhouse.io", "boards-api.eu.greenhouse.io"] as const;

export async function pollGreenhouse(slug: string, opts?: PollOptions): Promise<NormalizedJob[]> {
  let data: { jobs: GreenhouseJob[] } | null = null;
  let lastNotFound: AtsHttpError | null = null;

  for (const host of GREENHOUSE_HOSTS) {
    try {
      data = await fetchJson<{ jobs: GreenhouseJob[] }>(
        `https://${host}/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
      );
      break;
    } catch (err) {
      // Only a 404 means "try the other region". Anything else — a 500, a rate
      // limit, a network failure — is this host's problem and must surface, or
      // a transient outage would silently look like a board that has moved.
      if (err instanceof AtsHttpError && err.status === 404) {
        lastNotFound = err;
        continue;
      }
      throw err;
    }
  }

  // Genuinely absent from both regions: re-throw the 404 so source-poll.ts can
  // deactivate the board as it always has.
  if (!data) throw lastNotFound ?? new AtsHttpError(404, slug);

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
      // Greenhouse publishes no compensation on either the board list or the
      // single-job endpoint (verified 2026-08, metadata was null too).
      salary: null,
    raw: job,
  }));
}
