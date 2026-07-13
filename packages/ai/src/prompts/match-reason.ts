import { Type, type Schema } from "@google/genai";
import type { Profile } from "@apply4you/shared";
import { gemini, MODELS, withRetry, logUsage } from "../client.js";

export interface MatchReasonInput {
  jobId: string;
  title: string;
  company: string;
  descriptionSnippet: string;
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reasons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          jobId: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ["jobId", "reason"],
      },
    },
  },
  required: ["reasons"],
};

/**
 * FR-10: one-line "why this matches" per job, batched in a single Flash-Lite
 * call. Profile block first for implicit prefix caching (FR-21).
 */
export async function generateMatchReasons(
  profile: Profile,
  jobs: MatchReasonInput[],
): Promise<Map<string, string>> {
  if (jobs.length === 0) return new Map();

  const prompt = `<profile>
${JSON.stringify({ summary: profile.summary, skills: profile.skills, workHistory: profile.workHistory.map((j) => ({ title: j.title, company: j.company })) })}
</profile>

For each job below, write ONE sentence (max 20 words) naming the specific overlap between this candidate and the job — a shared skill, domain, or role. Ground it in the profile; never invent. Plain wording, no hype.

<jobs>
${JSON.stringify(jobs.map((j) => ({ jobId: j.jobId, title: j.title, company: j.company, description: j.descriptionSnippet.slice(0, 600) })))}
</jobs>`;

  const response = await withRetry(() =>
    gemini().models.generateContent({
      model: MODELS.lite,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.2 },
    }),
  );
  logUsage("match-reason", MODELS.lite, response.usageMetadata);

  const parsed = JSON.parse(response.text ?? '{"reasons":[]}') as { reasons: Array<{ jobId: string; reason: string }> };
  return new Map(parsed.reasons.map((r) => [r.jobId, r.reason]));
}
