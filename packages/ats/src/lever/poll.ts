import type { NormalizedJob } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import type { PollOptions } from "../types.js";

/** Shape verified against api.lever.co 2026-07. */
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number; // ms epoch
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  openingPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  country?: string;
  workplaceType?: string;
  /** Verified live 2026-08: {"min":80000,"max":95000,"currency":"USD","interval":"per-year-salary"} */
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

/** Lever's interval strings look like "per-year-salary" / "per-hour-wage". */
function leverPeriod(interval?: string): string | null {
  if (!interval) return null;
  const m = /per-(year|month|week|day|hour)/i.exec(interval);
  return m ? m[1]!.toLowerCase() : null;
}

export async function pollLever(slug: string, opts?: PollOptions): Promise<NormalizedJob[]> {
  const postings = await fetchJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  );

  return postings.map((p) => {
    const description = [
      p.openingPlain,
      p.descriptionPlain,
      ...(p.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, "\n")}`),
      p.additionalPlain,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return {
      atsType: "lever" as const,
      externalId: p.id,
      title: p.text,
      company: opts?.companyName ?? slug,
      location: p.categories?.location ?? null,
      description,
      applyUrl: p.applyUrl ?? `${p.hostedUrl}/apply`,
      requiresLogin: false,
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      // Only when Lever actually carries a figure; never inferred from prose.
      salary:
        p.salaryRange && (p.salaryRange.min != null || p.salaryRange.max != null)
          ? {
              min: p.salaryRange.min ?? null,
              max: p.salaryRange.max ?? null,
              currency: p.salaryRange.currency ?? null,
              period: leverPeriod(p.salaryRange.interval),
              summary: null,
              source: "lever.salaryRange",
            }
          : null,
      raw: p,
    };
  });
}
