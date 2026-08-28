import type { Profile, Preferences } from "@apply4you/shared";
import { gemini, MODELS, EMBEDDING_DIMS, withRetry, logUsage } from "./client.js";

async function embed(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[]> {
  const response = await withRetry(() =>
    gemini().models.embedContent({
      model: MODELS.embedding,
      contents: text,
      config: { taskType, outputDimensionality: EMBEDDING_DIMS },
    }),
  );
  // embedContent does not return usageMetadata — estimate input tokens from
  // text length (~4 chars/token). Embedding pricing is input-only.
  logUsage("embed", MODELS.embedding, { promptTokenCount: Math.ceil(text.length / 4) });
  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(`embedding failed: got ${values?.length ?? 0} dims`);
  }
  // Truncated gemini-embedding-001 vectors are not unit-norm; normalize for cosine ops.
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

/** Jobs are the searched documents. Truncate: embeddings need the gist, not all 10k chars. */
export function jobEmbeddingText(job: { title: string; company: string; location: string | null; description: string }): string {
  return `${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}\n\n${job.description.slice(0, 6000)}`;
}

export async function embedJob(text: string): Promise<number[]> {
  return embed(text, "RETRIEVAL_DOCUMENT");
}

/** The profile+preferences act as the query. */
export function profileEmbeddingText(profile: Profile, prefs: Preferences): string {
  const roles = profile.workHistory
    .map((j) => `${j.title} at ${j.company}: ${j.bullets.slice(0, 4).join("; ")}`)
    .join("\n");
  return [
    prefs.titles.length ? `Target roles: ${prefs.titles.join(", ")}` : "",
    // Where they can actually work. Omitted until now, which is part of why a
    // Manchester graduate's nearest neighbours were San Francisco: nothing in
    // the query vector said otherwise. This is the softest of the three
    // location signals — the candidate pool and the boost do the real work —
    // but it costs nothing and pulls the query toward the right region.
    prefs.locations.length ? `Locations: ${prefs.locations.join(", ")}` : "",
    prefs.seniority.length ? `Seniority: ${prefs.seniority.join(", ")}` : "",
    prefs.industries.length ? `Industries: ${prefs.industries.join(", ")}` : "",
    profile.summary,
    `Skills: ${profile.skills.join(", ")}`,
    roles,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);
}

export async function embedProfile(text: string): Promise<number[]> {
  return embed(text, "RETRIEVAL_QUERY");
}
