import { Type, type Schema } from "@google/genai";
import { ParsedResumeSchema, type ParsedResume } from "@apply4you/shared";
import { gemini, MODELS, withRetry, logUsage } from "../client.js";

/**
 * FR-1: parse an uploaded resume into the Profile shape.
 * PDFs go to Gemini as inline file data (better layout handling than local
 * text extraction); DOCX callers should convert to plain text first (mammoth)
 * and use `parseResumeText`.
 */

const RESUME_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    firstName: { type: Type.STRING },
    lastName: { type: Type.STRING },
    email: { type: Type.STRING },
    phone: { type: Type.STRING },
    location: { type: Type.STRING },
    links: {
      type: Type.OBJECT,
      properties: {
        linkedin: { type: Type.STRING },
        github: { type: Type.STRING },
        portfolio: { type: Type.STRING },
      },
    },
    workAuthorization: { type: Type.STRING },
    workHistory: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          title: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["company", "title", "start", "end", "bullets"],
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          school: { type: Type.STRING },
          degree: { type: Type.STRING },
          field: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
        },
        required: ["school", "degree", "field", "start", "end"],
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

const INSTRUCTIONS = `Extract the candidate's information from this resume.
Rules:
- Extract ONLY what appears in the resume. Never infer or invent anything.
- Omit any property that is absent from the resume (do not output empty guesses).
- Normalize dates to ISO format (YYYY-MM). Use "present" as the end value for current roles.
- links: full URLs when present.
- workAuthorization: only if explicitly stated (e.g. "US citizen", "requires sponsorship").
- bullets: the achievement/responsibility bullet points, verbatim.`;

function validate(text: string): ParsedResume {
  const parsed: unknown = JSON.parse(text);
  return ParsedResumeSchema.parse(parsed);
}

export async function parseResumePdf(pdfBytes: Uint8Array): Promise<ParsedResume> {
  const response = await withRetry(() =>
    gemini().models.generateContent({
      model: MODELS.flash,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdfBytes).toString("base64") } },
            { text: INSTRUCTIONS },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESUME_RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  );
  logUsage("resume-parse-pdf", MODELS.flash, response.usageMetadata);
  return validate(response.text ?? "{}");
}

export async function parseResumeText(resumeText: string): Promise<ParsedResume> {
  const response = await withRetry(() =>
    gemini().models.generateContent({
      model: MODELS.flash,
      contents: [{ role: "user", parts: [{ text: `${INSTRUCTIONS}\n\n<resume>\n${resumeText}\n</resume>` }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESUME_RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  );
  logUsage("resume-parse-text", MODELS.flash, response.usageMetadata);
  return validate(response.text ?? "{}");
}
