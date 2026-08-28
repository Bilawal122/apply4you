import {
  FILLABLE_FIELD_TYPES,
  isExcludedFromResolution,
  type Field,
  type ResolvedValues,
  type UnresolvedField,
} from "@apply4you/shared";

/**
 * The review gate's pure logic, extracted from the server actions so it can
 * be tested directly (P1-08). packages/shared/test/unresolved-guard.test.ts
 * used to pin hand-mirrored COPIES of these checks — which meant a drift in
 * the real actions could pass every test. The actions now import these; the
 * tests in apps/web/test/approval-gate.test.ts exercise the real thing.
 */

/** User edits merged onto stored values: unknown field ids dropped, "" → null. */
export function mergeFieldEdits(
  schema: Field[],
  existing: ResolvedValues,
  edits: ResolvedValues,
): ResolvedValues {
  const knownIds = new Set(schema.map((f) => f.id));
  const merged: ResolvedValues = { ...existing };
  for (const [id, value] of Object.entries(edits)) {
    if (knownIds.has(id)) merged[id] = value === "" ? null : value;
  }
  return merged;
}

/**
 * Which fields still need the user. Uses the same exclusion predicate the
 * resolver uses — anything resolution deliberately skips (files, demographic
 * questions, resume_text) must not count as an unanswered required field, or
 * the application becomes permanently unapprovable.
 */
export function computeUnresolved(schema: Field[], values: ResolvedValues): UnresolvedField[] {
  return schema
    .filter((f) => !isExcludedFromResolution(f) && (values[f.id] ?? null) === null)
    .map((f) => ({ id: f.id, label: f.label, required: f.required }));
}

/** An unanswered REQUIRED field parks the application for review. */
export function reviewStatusFor(unresolved: UnresolvedField[]): "draft" | "needs_review" {
  return unresolved.some((u) => u.required) ? "needs_review" : "draft";
}

/**
 * The approval gate. Returns the refusal message, or null when approval may
 * proceed. Order matters and is part of the contract: status beats closed
 * beats unread-form beats undrivable — each earlier condition makes the later
 * ones meaningless to report.
 */
export function approvalRefusal(app: {
  status: string;
  jobClosedAt: string | null;
  formSchema: Field[] | null;
}): string | null {
  if (app.status !== "draft") {
    if (app.status === "needs_review") return "answer the required fields first";
    return `already ${app.status}`;
  }

  // The posting can close between queueing and approval. The submit worker
  // already fails gracefully on a dead form (DECISIONS.md D3), but only after
  // claiming a daily-cap slot and spending a browser run — and the user has
  // spent their attention reviewing something that was never going to send.
  if (app.jobClosedAt) {
    return "this posting has closed since it was queued — nothing to send, so Skip it";
  }

  // An application whose form was never read cannot be approved.
  //
  // This is the failure every other guard here was blind to, because they all
  // look FOR something wrong in form_schema — an undrivable field, an
  // unanswered required one — and a null schema contains nothing to object to.
  // So a draft the resolver had never touched passed every check, rendered as
  // "0 of 0 filled · ready to send", and one approval away from opening a real
  // employer's form and clicking submit with nothing typed into it.
  //
  // `null` means the resolve job never ran (queue outage, worker down). An
  // empty array means it ran and read zero fields, which for a job application
  // is equally impossible — every real form asks for at least a name. Both are
  // "not ready", never "nothing needed".
  if (!app.formSchema || app.formSchema.length === 0) {
    return "this application hasn't been filled out yet — the AI still needs to read the employer's form. It'll be ready shortly.";
  }

  // A required field type the fill layer can't drive (consent checkbox, date
  // picker, unknown widget) would fail on the employer's validation every
  // time — refuse the approval instead (DECISIONS.md D3).
  const undrivable = app.formSchema.find((f) => f.required && !FILLABLE_FIELD_TYPES.has(f.type));
  if (undrivable) {
    return `this form has a required "${undrivable.label.slice(0, 60)}" (${undrivable.type}) we can't fill automatically — apply via the posting link, then Skip this one`;
  }

  return null;
}
