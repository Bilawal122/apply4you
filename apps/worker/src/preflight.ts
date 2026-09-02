import {
  FILLABLE_FIELD_TYPES,
  isDemographicField,
  isExcludedFromResolution,
  type Field,
  type ResolvedValues,
  type UnresolvedField,
} from "@apply4you/shared";

/**
 * Final bookkeeping of a resolution pass (FR-16 + DECISIONS.md D3 pre-flight),
 * extracted from processors/resolve.ts so the parking rules are directly
 * testable (P1-08) — they used to be exercised only through the underlying
 * predicates, so a wiring change here could bypass demographic parking
 * without failing any test.
 *
 * Rules: every workable non-file field left null is unresolved; every
 * REQUIRED field that is unfillable (a type the fill layer can't drive) or a
 * demographic question is force-parked — its value cleared and marked
 * unresolved — so no best-effort fill can reach a real employer. A required
 * gap parks the whole application as needs_review.
 */
export function finalizeResolution(
  formSchema: Field[],
  workable: Field[],
  resolved: ResolvedValues,
): {
  resolvedFields: ResolvedValues;
  unresolved: UnresolvedField[];
  status: "draft" | "needs_review";
} {
  const resolvedFields: ResolvedValues = { ...resolved };

  const unresolved: UnresolvedField[] = workable
    .filter((f) => f.type !== "file" && resolvedFields[f.id] === null)
    .map((f) => ({ id: f.id, label: f.label, required: f.required }));

  for (const f of formSchema) {
    if (!f.required) continue;
    const unfillable = !FILLABLE_FIELD_TYPES.has(f.type);
    const requiredDemographic = isDemographicField(f.id, f.label);
    if ((unfillable || requiredDemographic) && !unresolved.some((u) => u.id === f.id)) {
      resolvedFields[f.id] = null;
      unresolved.push({ id: f.id, label: f.label, required: true });
    }
  }

  const status = unresolved.some((u) => u.required) ? "needs_review" : "draft";
  return { resolvedFields, unresolved, status };
}

/**
 * Submit-time form-drift check (DECISIONS.md D3.6), pure so it is testable.
 *
 * `stored` is the schema the user reviewed and approved against; `live` is
 * what the employer's form asks for right now. The fill must run against
 * `live` — controls that no longer exist only time out, and controls the
 * stored schema never knew about are the ones that make the employer's
 * validation reject the submission.
 *
 * The one outcome this refuses is a required question the user has never
 * seen and has no answer for: `newRequiredUnanswered`. Files, the paste-resume
 * textarea and demographic questions are excluded from that judgement exactly
 * as they are from resolution — a new EEOC question is not a reason to park,
 * and we would never answer it anyway.
 */
export function diffFormSchema(
  stored: Field[],
  live: Field[],
  values: ResolvedValues,
): {
  /** The schema to fill from: `live`, always. */
  fields: Field[];
  added: Field[];
  removed: Field[];
  newRequiredUnanswered: Field[];
} {
  const storedIds = new Set(stored.map((f) => f.id));
  const liveIds = new Set(live.map((f) => f.id));
  const added = live.filter((f) => !storedIds.has(f.id));
  const removed = stored.filter((f) => !liveIds.has(f.id));
  const newRequiredUnanswered = added.filter(
    (f) => f.required && !isExcludedFromResolution(f) && (values[f.id] ?? null) === null,
  );
  return { fields: live, added, removed, newRequiredUnanswered };
}
