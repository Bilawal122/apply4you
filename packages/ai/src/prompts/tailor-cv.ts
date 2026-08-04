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
    projectIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    educationIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    rationale: { type: Type.STRING },
  },
  required: ["summary", "roles", "skillIndices", "projectIndices", "educationIndices", "rationale"],
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
  const projects = input.profile.projects.map((pr, i) => ({
    index: i,
    name: pr.name,
    tech: pr.tech,
    bullets: pr.bullets,
  }));
  const education = input.profile.education.map((e, i) => ({
    index: i,
    degree: e.degree,
    field: e.field,
    school: e.school,
  }));

  return `You are selecting which parts of a candidate's real CV to put in front of one specific employer.

You are NOT writing a CV. You do not rewrite, reword, embellish or invent anything. You return indices.

Rules:
This CV will be read by an applicant tracking system before a human sees it, so COVERAGE MATTERS. Cutting relevant content lowers the candidate's keyword match. Your job is to ORDER and PRIORITISE, not to shorten.

- roles: every role, most relevant first. Drop a role only if it has genuinely no bearing on this job. Never drop a role because it is old.
- bulletIndices: within each role, ALL of its bullets, ordered most-relevant first. Only omit a bullet that is actively irrelevant to this employer. Do not trim for brevity — a fuller CV scores better with an ATS, and the candidate worked for these lines.
- skillIndices: ALL skills the employer asked for or would plausibly value, most relevant first. Include adjacent and transferable ones; only drop skills with no bearing on the role.
- projectIndices: the candidate's projects, most relevant first. For a career-changer or recent graduate these are often the strongest evidence — include them generously.
- educationIndices: all of them, most recent first.
- summary: 3-4 sentences, first person implied (no "I"), naming what this candidate brings to THIS role and echoing the words the job description itself uses (ATS parsers match on them). Ground every claim in the profile below. Invent nothing — no numbers, employers, tools or credentials that do not appear above. No hype. Banned words: ${BANNED_PHRASES.join(", ")}.
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

<candidate_projects>
${JSON.stringify(projects)}
</candidate_projects>

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
