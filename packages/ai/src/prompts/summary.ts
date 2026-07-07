import { BANNED_PHRASES, type Profile } from "@apply4you/shared";
import { gemini, MODELS, withRetry } from "../client.js";

/**
 * FR-4: derive the reusable Profile.summary once per profile.
 * Regenerated only when the profile is edited.
 */
export async function deriveSummary(profile: Omit<Profile, "summary">): Promise<string> {
  const prompt = `Write a 3-4 sentence professional summary of this candidate for use in job applications.

Rules:
- Ground every claim in the profile below. Never invent experience, numbers, or credentials.
- Plain, direct tone. First person without "I am passionate" style filler.
- Banned phrases: ${BANNED_PHRASES.join(", ")}.
- Lead with role/seniority and years of experience only if derivable from the work history dates.

<profile>
${JSON.stringify(profile, null, 2)}
</profile>`;

  const response = await withRetry(() =>
    gemini().models.generateContent({
      model: MODELS.flash,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.4 },
    }),
  );
  return (response.text ?? "").trim();
}
