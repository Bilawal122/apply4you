import { BANNED_PHRASES, type Profile } from "@apply4you/shared";
import { gemini, MODELS, withRetry, logUsage } from "../client.js";

/**
 * FR-17/18: cover letter grounded in profile facts, tuned to the specific job.
 * Post-generation guard rejects banned phrases and bracket placeholders; one
 * retry with the violation named, then the caller marks the app needs_review.
 */

export interface CoverLetterInput {
  profile: Profile;
  job: { title: string; company: string; description: string };
  maxLength?: number;
}

const PLACEHOLDER_RE = /\[[^\]]{2,40}\]|\{[^}]{2,40}\}/;

function violations(text: string): string[] {
  const found: string[] = [];
  for (const phrase of BANNED_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) found.push(`banned phrase: "${phrase}"`);
  }
  if (PLACEHOLDER_RE.test(text)) found.push("contains a [placeholder]");
  return found;
}

function buildPrompt(input: CoverLetterInput, previousViolations?: string[]): string {
  const targetWords = input.maxLength ? Math.min(280, Math.floor(input.maxLength / 6)) : 250;
  return `Write a cover letter for this candidate applying to this job.

Rules:
- Ground EVERY claim in the profile below. Never invent experience, numbers, employers, or credentials.
- Name 2-3 concrete requirements from the job description and connect them to specific profile facts.
- Plain, direct, confident tone. No hype words. Banned: ${BANNED_PHRASES.join(", ")}.
- No placeholders like [Company] or [Your Name] — write the final text, addressed to the ${input.job.company} hiring team, signed with the candidate's name.
- About ${targetWords} words.${input.maxLength ? ` HARD LIMIT: ${input.maxLength} characters.` : ""}
${previousViolations?.length ? `- Your previous draft was rejected for: ${previousViolations.join("; ")}. Do not repeat these.` : ""}

<profile>
${JSON.stringify(input.profile)}
</profile>

<job>
${JSON.stringify({ title: input.job.title, company: input.job.company, description: input.job.description.slice(0, 5000) })}
</job>

Return only the letter text.`;
}

export async function generateCoverLetter(input: CoverLetterInput): Promise<{ text: string; ok: boolean }> {
  let lastViolations: string[] | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await withRetry(() =>
      gemini().models.generateContent({
        model: MODELS.flash,
        contents: [{ role: "user", parts: [{ text: buildPrompt(input, lastViolations) }] }],
        config: { temperature: 0.5 },
      }),
    );
    logUsage("cover-letter", MODELS.flash, response.usageMetadata);
    let text = (response.text ?? "").trim();
    if (input.maxLength && text.length > input.maxLength) text = text.slice(0, input.maxLength);

    const found = violations(text);
    if (found.length === 0 && text.length > 100) return { text, ok: true };
    lastViolations = found.length ? found : ["letter too short"];
  }

  return { text: "", ok: false };
}
