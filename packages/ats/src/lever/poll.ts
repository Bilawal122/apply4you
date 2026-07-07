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
      raw: p,
    };
  });
}
