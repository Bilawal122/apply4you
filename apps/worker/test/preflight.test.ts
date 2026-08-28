import { describe, expect, it } from "vitest";
import type { Field } from "@apply4you/shared";
import { finalizeResolution } from "../src/preflight.js";

const field = (over: Partial<Field> & { id: string }): Field => ({
  label: over.id,
  type: "text",
  required: false,
  ...over,
});

describe("finalizeResolution — the resolve pre-flight, tested as wired (P1-08)", () => {
  it("a required demographic field is force-parked even if something filled it", () => {
    const gender = field({ id: "gender", label: "Gender identity", required: true });
    const name = field({ id: "name", label: "Full name", required: true });
    const form = [name, gender];
    // `workable` excludes demographic fields upstream — but simulate a value
    // having leaked in anyway: the park must clear it.
    const { resolvedFields, unresolved, status } = finalizeResolution(form, [name], {
      name: "Ada",
      gender: "female",
    });
    expect(resolvedFields.gender).toBeNull();
    expect(unresolved).toContainEqual({ id: "gender", label: "Gender identity", required: true });
    expect(status).toBe("needs_review");
  });

  it("a required unfillable type (consent checkbox, date picker) parks the application", () => {
    const consent = field({ id: "consent", label: "I agree to the terms", type: "checkbox", required: true });
    const name = field({ id: "name", required: true });
    const { unresolved, status } = finalizeResolution([name, consent], [name], { name: "Ada" });
    expect(unresolved.map((u) => u.id)).toEqual(["consent"]);
    expect(status).toBe("needs_review");
  });

  it("an OPTIONAL unfillable or demographic field does not park anything", () => {
    const date = field({ id: "start", label: "Start date", type: "date" });
    const race = field({ id: "race", label: "Race/Ethnicity" });
    const name = field({ id: "name", required: true });
    const { unresolved, status } = finalizeResolution([name, date, race], [name], { name: "Ada" });
    expect(unresolved).toEqual([]);
    expect(status).toBe("draft");
  });

  it("a null workable answer is unresolved; required null -> needs_review, optional null -> draft", () => {
    const why = field({ id: "why", label: "Why us?", type: "textarea", required: true });
    const extra = field({ id: "extra", label: "Anything else?", type: "textarea" });
    const both = [why, extra];
    const required = finalizeResolution(both, both, { why: null, extra: null });
    expect(required.status).toBe("needs_review");
    expect(required.unresolved.map((u) => u.id).sort()).toEqual(["extra", "why"]);

    const optionalOnly = finalizeResolution(both, both, { why: "Because.", extra: null });
    expect(optionalOnly.status).toBe("draft");
    expect(optionalOnly.unresolved.map((u) => u.id)).toEqual(["extra"]);
  });

  it("file fields are never counted as unresolved — the upload happens at fill time", () => {
    const resume = field({ id: "resume", label: "Resume", type: "file", required: true });
    const { unresolved, status } = finalizeResolution([resume], [resume], { resume: null });
    expect(unresolved).toEqual([]);
    expect(status).toBe("draft");
  });

  it("does not double-park a field that is already unresolved", () => {
    const consent = field({ id: "consent", label: "Consent", type: "checkbox", required: true });
    const { unresolved } = finalizeResolution([consent], [consent], { consent: null });
    expect(unresolved.filter((u) => u.id === "consent")).toHaveLength(1);
  });

  it("a fully-answered form is a draft ready for review", () => {
    const name = field({ id: "name", required: true });
    const email = field({ id: "email", type: "email", required: true });
    const form = [name, email];
    const { status, unresolved } = finalizeResolution(form, form, { name: "Ada", email: "a@b.c" });
    expect(status).toBe("draft");
    expect(unresolved).toEqual([]);
  });
});
