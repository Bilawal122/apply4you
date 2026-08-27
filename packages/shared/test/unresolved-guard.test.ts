import { describe, expect, it } from "vitest";
import { FILLABLE_FIELD_TYPES, type Field } from "../src/index.js";

/**
 * The shape of the bug that let an unfilled application reach "Approve &
 * submit": every guard in approveOne looks FOR something wrong inside
 * form_schema, and an empty schema contains nothing to find.
 *
 * These pin the predicate itself. The real guard lives in
 * apps/web/app/(app)/applications/actions.ts, which has no test runner of its
 * own — see the PR for why that gap matters.
 */

/** Mirrors approveOne's undrivable-field check. */
function findUndrivable(schema: Field[]): Field | undefined {
  return schema.find((f) => f.required && !FILLABLE_FIELD_TYPES.has(f.type));
}

/** Mirrors approveOne's new precondition. */
function isNotReady(schema: Field[] | null): boolean {
  return !schema || schema.length === 0;
}

const textField = (id: string, required: boolean): Field => ({
  id,
  label: id,
  type: "text",
  required,
  options: null,
  maxLength: null,
});

describe("the blindness that shipped", () => {
  it("finds nothing wrong with a schema that was never read", () => {
    // This is why approval succeeded: no field to object to.
    expect(findUndrivable([])).toBeUndefined();
  });

  it("finds nothing wrong with a null schema either", () => {
    expect(findUndrivable((null ?? []) as Field[])).toBeUndefined();
  });
});

describe("isNotReady", () => {
  it("refuses a schema the resolver never wrote", () => {
    expect(isNotReady(null)).toBe(true);
  });

  it("refuses a schema that was read as zero fields", () => {
    // A real job application always asks for at least a name, so zero fields
    // means the read failed — not that the form needs nothing.
    expect(isNotReady([])).toBe(true);
  });

  it("allows a schema with real fields", () => {
    expect(isNotReady([textField("first_name", true)])).toBe(false);
  });

  it("allows a single optional field", () => {
    expect(isNotReady([textField("linkedin", false)])).toBe(false);
  });
});
