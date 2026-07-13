import { Type, type Schema } from "@google/genai";
import type { Field, Profile, ResolvedValues } from "@apply4you/shared";
import { gemini, MODELS, withRetry, logUsage } from "../client.js";

/**
 * FR-13/14/15: one batched call per application resolving every field the
 * deterministic layer couldn't. Fields are referenced by index (ATS field ids
 * contain brackets and other characters unsafe as schema property names).
 */

export const MULTI_VALUE_SEPARATOR = " || ";

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          i: { type: Type.INTEGER },
          value: { type: Type.STRING, nullable: true },
        },
        required: ["i", "value"],
      },
    },
  },
  required: ["answers"],
};

export interface ResolutionContext {
  profile: Profile;
  job: { title: string; company: string; description: string };
}

function buildPrompt(ctx: ResolutionContext, fields: Field[]): string {
  const fieldList = fields.map((f, i) => ({
    i,
    label: f.label,
    type: f.type,
    options: f.options,
    required: f.required,
    maxLength: f.maxLength,
  }));

  // Profile block first and byte-identical across a user's batch -> Gemini
  // implicit prefix caching (FR-21).
  return `You fill job-application form fields for a candidate, using ONLY facts present in their profile.

Rules — these override everything else:
- NEVER invent experience, skills, numbers, dates, names, or credentials. If the profile does not contain the information a field asks for, return null for that field.
- Questions about the candidate's preferences or intentions (willingness to relocate, remote vs office, consent, acknowledgement agreements) that cannot be answered from the profile: return null. Do NOT guess or answer on the candidate's behalf.
- Work authorization / visa sponsorship questions: answer ONLY if the profile's workAuthorization field clearly determines the answer; otherwise null.
- type "select" or "radio": return EXACTLY one string from that field's options, verbatim.
- type "multiselect": return the applicable options verbatim, joined by "${MULTI_VALUE_SEPARATOR.trim()}" — only options justified by the profile.
- Respect maxLength where given.
- Free-text answers: plain, direct, grounded in the profile and relevant to this specific job. Banned phrases: "passionate about", "leverage", "excited to".
- Salary expectation questions: return null (the candidate answers these personally).
- Return an answer entry for EVERY field index, using null when unresolvable.

<profile>
${JSON.stringify(ctx.profile)}
</profile>

<job>
${JSON.stringify({ title: ctx.job.title, company: ctx.job.company, description: ctx.job.description.slice(0, 4000) })}
</job>

<fields>
${JSON.stringify(fieldList)}
</fields>`;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
}

/** Case-insensitive canonicalization against options; null when not matched. */
function matchOption(value: string, options: string[]): string | null {
  const exact = options.find((o) => o === value);
  if (exact) return exact;
  const ci = options.find((o) => o.trim().toLowerCase() === value.trim().toLowerCase());
  return ci ?? null;
}

export function postValidate(field: Field, raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  let value = raw.trim();

  if ((field.type === "select" || field.type === "radio") && field.options?.length) {
    return matchOption(value, field.options);
  }
  if (field.type === "multiselect" && field.options?.length) {
    const parts = value
      .split(MULTI_VALUE_SEPARATOR.trim())
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => matchOption(p, field.options!))
      .filter((p): p is string => p !== null);
    return parts.length ? parts.join(MULTI_VALUE_SEPARATOR) : null;
  }
  if (field.maxLength) value = truncateAtWord(value, field.maxLength);
  return value;
}

export async function resolveFieldsWithLlm(ctx: ResolutionContext, fields: Field[]): Promise<ResolvedValues> {
  if (fields.length === 0) return {};

  const response = await withRetry(() =>
    gemini().models.generateContent({
      model: MODELS.lite,
      contents: [{ role: "user", parts: [{ text: buildPrompt(ctx, fields) }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  );
  logUsage("field-resolution", MODELS.lite, response.usageMetadata);

  const parsed = JSON.parse(response.text ?? '{"answers":[]}') as {
    answers: Array<{ i: number; value: string | null }>;
  };

  const resolved: ResolvedValues = {};
  for (const field of fields) resolved[field.id] = null; // FR-16: default null
  for (const answer of parsed.answers) {
    const field = fields[answer.i];
    if (!field) continue;
    resolved[field.id] = postValidate(field, answer.value);
  }
  return resolved;
}
