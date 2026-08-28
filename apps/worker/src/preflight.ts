import {
  FILLABLE_FIELD_TYPES,
  isDemographicField,
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
