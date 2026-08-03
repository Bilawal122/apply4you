import { Type, type Schema } from "@google/genai";
import { BANNED_PHRASES, TailoredCvSchema, type Profile, type TailoredCv } from "@apply4you/shared";
import { gemini, MODELS, withRetry, logUsage } from "../client.js";

/**
 * Per-job tailored CV (task #40). The model chooses WHICH of the candidate's
 * real experience to show and in what order — it never rewrites it. Everything
 * except the summary comes back as indices into the profile, so the rendered
 * document can only ever contain the candidate's own words.
 *
 * See resolveTailoredCv() in @apply4you/shared for the index-validation
 * backstop that discards anything out of range.
 */

export interface TailorCvInput {
  profile: Profile;
  job: { title: string; company: string; description: string };
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    roles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          bulletIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ["index", "bulletIndices"],
      },
    },
    skillIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    educationIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    rationale: { type: Type.STRING },
  },
  required: ["summary", "roles", "skillIndices", "educationIndices", "rationale"],
};

function buildPrompt(input: TailorCvInput): string {
  // Index the profile explicitly so the model has stable handles to return.
  const roles = input.profile.workHistory.map((r, i) => ({
    index: i,
    title: r.title,
    company: r.company,
    dates: `${r.start}–${r.end}`,
    bullets: r.bullets.map((b, bi) => ({ index: bi, text: b })),
  }));
  const skills = input.profile.skills.map((s, i) => ({ index: i, skill: s }));
  const education = input.profile.education.map((e, i) => ({
    index: i,
    degree: e.degree,
    field: e.field,
    school: e.school,
  }));

  return `You are selecting which parts of a candidate's real CV to put in front of one specific employer.

You are NOT writing a CV. You do not rewrite, reword, embellish or invent anything. You return indices.

Rules:
- roles: the candidate's roles worth showing, most relevant first. Keep every role that could matter; drop only ones with no bearing on this job. Never drop a role just because it is old if it is the only relevant experience.
- bulletIndices: within each role, the bullets that speak to THIS job's requirements, most relevant first. Prefer 2-4 per role. If a role has few bullets, keep them all.
- skillIndices: the candidate's skills this employer actually asked for or would value, most relevant first.
- educationIndices: usually all of them; drop only if clearly irrelevant.
- summary: 2-3 sentences, first person implied (no "I"), naming what this candidate brings to THIS role. Ground every claim in the profile below. Invent nothing — no numbers, employers, tools or credentials that do not appear above. No hype. Banned words: ${BANNED_PHRASES.join(", ")}.
- rationale: ONE short sentence telling the candidate why you shaped it this way, addressed to them ("Led with your billing work because...").

<job>
${JSON.stringify({ title: input.job.title, company: input.job.company, description: input.job.description.slice(0, 5000) })}
</job>

<candidate_roles>
${JSON.stringify(roles)}
</candidate_roles>

<candidate_skills>
${JSON.stringify(skills)}
</candidate_skills>

<candidate_education>
${JSON.stringify(education)}
</candidate_education>

<candidate_context>
${JSON.stringify({ summary: input.profile.summary, additionalInfo: input.profile.additionalInfo || undefined })}
</candidate_context>`;
}

/**
 * Returns null when the model can't produce a usable selection — callers fall
 * back to the untailored profile rather than shipping a broken document.
 */
export async function tailorCv(input: TailorCvInput): Promise<TailoredCv | null> {
  const response = await withRetry(() =>
    gemini().models.generateContent({
      model: MODELS.flash,
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.3 },
    }),
  );
  logUsage("tailor-cv", MODELS.flash, response.usageMetadata);

  try {
    const parsed = TailoredCvSchema.parse(JSON.parse(response.text ?? "{}"));
    const lower = parsed.summary.toLowerCase();
    if (BANNED_PHRASES.some((p) => lower.includes(p.toLowerCase()))) {
      // Keep the (index-based, therefore safe) selection, drop the prose.
      return { ...parsed, summary: "" };
    }
    return parsed;
  } catch {
    return null;
  }
}
