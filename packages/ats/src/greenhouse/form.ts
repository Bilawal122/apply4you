import type { Field } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import { decodeEntities } from "../html.js";
import type { JobRef } from "../types.js";

/** Shape verified against boards-api.greenhouse.io ?questions=true 2026-07. */
interface GreenhouseQuestion {
  label: string;
  required: boolean;
  fields: Array<{
    name: string;
    type: "input_text" | "textarea" | "input_file" | "input_hidden" | "multi_value_single_select" | "multi_value_multi_select";
    values: Array<{ label: string; value: string | number }>;
  }>;
}

interface GreenhouseJobResponse {
  questions: GreenhouseQuestion[];
  /** Candidate location block (`Location (City)` + hidden lat/long). */
  location_questions?: GreenhouseQuestion[];
  /** "education_required" | "education_optional" | null — a flag, not a question. */
  education?: string | null;
}

/**
 * Live DOM ids of the controls the questions API does not name. Verified on
 * the embed form 2026-09-02: the location and education blocks are rendered
 * from top-level flags, and their inputs carry these ids, not API names.
 */
const LOCATION_CONTROL_ID = "candidate-location";
const EDUCATION_CONTROLS: Field[] = [
  { id: "school--0", label: "School", type: "select", required: true },
  { id: "degree--0", label: "Degree", type: "select", required: true },
];

type GreenhouseFieldType = GreenhouseQuestion["fields"][number]["type"];

/** API field type -> our Field type. Types with no entry (hidden inputs) are not fields to fill. */
const TYPE_MAP: Partial<Record<GreenhouseFieldType, Field["type"]>> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
};

export async function readGreenhouseForm(job: JobRef): Promise<Field[]> {
  const data = await fetchJson<GreenhouseJobResponse>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.boardSlug)}/jobs/${encodeURIComponent(job.externalId)}?questions=true`,
  );

  const fields: Field[] = [];
  for (const question of data.questions ?? []) {
    for (const f of question.fields) {
      const type = TYPE_MAP[f.type];
      if (!type) continue;
      fields.push({
        id: f.name,
        label: decodeEntities(question.label).trim(),
        type,
        options: f.values.length ? f.values.map((v) => v.label) : undefined,
        required: question.required,
      });
    }
  }
  // The location block lives outside `questions`. Its text input is required
  // whenever it is present; the lat/long fields are hidden inputs the widget
  // sets when a suggestion is picked, so they are not fields to fill. Found the
  // hard way: a Stripe form had it required and the reader never saw it, so
  // resolution passed, review passed, and the fill would have submitted a blank.
  for (const question of data.location_questions ?? []) {
    for (const f of question.fields) {
      const type = TYPE_MAP[f.type];
      if (!type) continue;
      fields.push({
        id: f.name === "location" ? LOCATION_CONTROL_ID : f.name,
        label: decodeEntities(question.label).trim(),
        type,
        required: question.required,
      });
    }
  }
  // Education is a flag, not a question, and the API exposes no option lists
  // for it (schools are a searchable database). Surface the required case so
  // resolution and review know the form asks for it; the fill layer drives the
  // controls as searchable comboboxes. The optional case is deliberately left
  // alone: a blank is harmless, a guessed school on a real employer is not.
  if (data.education === "education_required") fields.push(...EDUCATION_CONTROLS);
  // Demographic/EEOC questions are intentionally not read: optional, and we
  // never answer them on the user's behalf.
  return fields;
}

/**
 * Greenhouse select values submit as numeric ids, not labels — the fill layer
 * needs the label->value mapping.
 */
export async function greenhouseSelectValueMap(job: JobRef): Promise<Map<string, Map<string, string>>> {
  const data = await fetchJson<{ questions: GreenhouseQuestion[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.boardSlug)}/jobs/${encodeURIComponent(job.externalId)}?questions=true`,
  );
  const map = new Map<string, Map<string, string>>();
  for (const question of data.questions ?? []) {
    for (const f of question.fields) {
      if (f.values.length) {
        map.set(f.name, new Map(f.values.map((v) => [v.label, String(v.value)])));
      }
    }
  }
  return map;
}
