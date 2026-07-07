import type { Field } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import type { JobRef } from "../types.js";

/** Shape verified against apply.workable.com/api/v1/jobs/{shortcode}/form 2026-07. */
interface WorkableFormField {
  id: string;
  label: string;
  type: string; // text | email | phone | paragraph | file | boolean | dropdown | multiple | group | date | number
  required: boolean;
  maxLength?: number;
  options?: Array<{ name?: string; value?: string } | string>;
}

interface WorkableFormSection {
  name: string;
  fields: WorkableFormField[];
}

function mapType(t: string): Field["type"] | null {
  switch (t) {
    case "text":
      return "text";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "paragraph":
      return "textarea";
    case "file":
      return "file";
    case "boolean":
      return "radio";
    case "dropdown":
      return "select";
    case "multiple":
      return "multiselect";
    case "date":
      return "date";
    case "number":
      return "number";
    case "group": // education/experience repeating groups — resume covers these
      return null;
    default:
      return null;
  }
}

function optionLabels(options: WorkableFormField["options"]): string[] | undefined {
  if (!options?.length) return undefined;
  return options.map((o) => (typeof o === "string" ? o : (o.name ?? o.value ?? ""))).filter(Boolean);
}

export async function readWorkableForm(job: JobRef): Promise<Field[]> {
  const sections = await fetchJson<WorkableFormSection[]>(
    `https://apply.workable.com/api/v1/jobs/${encodeURIComponent(job.externalId)}/form`,
  );

  const fields: Field[] = [];
  for (const section of sections) {
    for (const f of section.fields) {
      const type = mapType(f.type);
      if (!type) continue;
      // GDPR/avatar/photo noise: skip optional file fields that aren't the resume.
      if (type === "file" && f.id !== "resume") continue;
      fields.push({
        id: f.id,
        label: f.label || f.id,
        type,
        options: type === "radio" ? ["Yes", "No"] : optionLabels(f.options),
        required: f.required,
        maxLength: f.maxLength,
      });
    }
  }
  return fields;
}
