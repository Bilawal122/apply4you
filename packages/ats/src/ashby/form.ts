import type { Field } from "@apply4you/shared";
import { fetchJson } from "../fetch.js";
import type { JobRef } from "../types.js";

/**
 * Ashby's application form comes from the same GraphQL endpoint the public
 * job page uses (no auth). Shape verified 2026-07: fieldEntries[].field is a
 * JSON blob with path/title/type/selectableValues.
 */

interface AshbyFieldEntry {
  isRequired?: boolean;
  field: {
    path: string;
    title: string;
    type: string;
    isNullable?: boolean;
    selectableValues?: Array<{ label: string; value: string }>;
  };
}

interface AshbyFormResponse {
  data?: {
    jobPosting?: {
      applicationForm?: {
        sections?: Array<{ fieldEntries?: AshbyFieldEntry[] }>;
      };
    };
  };
}

const QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id
    applicationForm { sections { fieldEntries { field isRequired } } }
  }
}`;

function mapType(ashbyType: string): Field["type"] | null {
  switch (ashbyType) {
    case "String":
    case "Location":
      return "text";
    case "Email":
      return "email";
    case "Phone":
      return "phone";
    case "LongText":
      return "textarea";
    case "File":
      return "file";
    case "Boolean":
      return "radio";
    case "ValueSelect":
      return "select";
    case "MultiValueSelect":
      return "multiselect";
    case "Number":
      return "number";
    case "Date":
      return "date";
    default:
      return null; // unknown types are skipped, surfaced as unresolved by absence
  }
}

export async function readAshbyForm(job: JobRef): Promise<Field[]> {
  const response = await fetchJson<AshbyFormResponse>("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationName: "ApiJobPosting",
      variables: { organizationHostedJobsPageName: job.boardSlug, jobPostingId: job.externalId },
      query: QUERY,
    }),
  });

  const sections = response.data?.jobPosting?.applicationForm?.sections ?? [];
  const fields: Field[] = [];
  for (const section of sections) {
    for (const entry of section.fieldEntries ?? []) {
      const f = entry.field;
      const type = mapType(f.type);
      if (!type) continue;
      fields.push({
        id: f.path,
        label: f.title,
        type,
        options:
          type === "radio"
            ? ["Yes", "No"]
            : f.selectableValues?.length
              ? f.selectableValues.map((v) => v.label)
              : undefined,
        required: entry.isRequired ?? !f.isNullable,
      });
    }
  }
  return fields;
}
