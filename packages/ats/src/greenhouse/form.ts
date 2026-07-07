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
    type: "input_text" | "textarea" | "input_file" | "multi_value_single_select" | "multi_value_multi_select";
    values: Array<{ label: string; value: string | number }>;
  }>;
}

const TYPE_MAP = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
} as const;

export async function readGreenhouseForm(job: JobRef): Promise<Field[]> {
  const data = await fetchJson<{ questions: GreenhouseQuestion[] }>(
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
