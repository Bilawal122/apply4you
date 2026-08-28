import { describe, expect, it } from "vitest";
import type { Field } from "@apply4you/shared";
import {
  approvalRefusal,
  computeUnresolved,
  mergeFieldEdits,
  reviewStatusFor,
} from "../lib/approval-gate";

const field = (over: Partial<Field> & { id: string }): Field => ({
  label: over.id,
  type: "text",
  required: false,
  ...over,
});

const FORM: Field[] = [
  field({ id: "name", label: "Full name", required: true }),
  field({ id: "email", label: "Email", type: "email", required: true }),
  field({ id: "cover", label: "Anything else?", type: "textarea" }),
];

describe("approvalRefusal — the review gate, tested against the real module", () => {
  const ready = { status: "draft", jobClosedAt: null, formSchema: FORM };

  it("lets a filled draft through", () => {
    expect(approvalRefusal(ready)).toBeNull();
  });

  it("refuses needs_review — required answers first", () => {
    expect(approvalRefusal({ ...ready, status: "needs_review" })).toBe(
      "answer the required fields first",
    );
  });

  it("refuses anything already past draft", () => {
    for (const status of ["approved", "submitting", "submitted", "skipped", "failed"]) {
      expect(approvalRefusal({ ...ready, status })).toBe(`already ${status}`);
    }
  });

  it("refuses a posting that closed after queueing", () => {
    expect(approvalRefusal({ ...ready, jobClosedAt: "2026-08-01T00:00:00Z" })).toMatch(
      /posting has closed/,
    );
  });

  it("refuses a never-resolved application — null AND empty schema (the 0-questions bug)", () => {
    expect(approvalRefusal({ ...ready, formSchema: null })).toMatch(/hasn't been filled out yet/);
    expect(approvalRefusal({ ...ready, formSchema: [] })).toMatch(/hasn't been filled out yet/);
  });

  it("refuses a required field type the fill layer can't drive", () => {
    const withConsent = [...FORM, field({ id: "consent", label: "I consent", type: "checkbox", required: true })];
    expect(approvalRefusal({ ...ready, formSchema: withConsent })).toMatch(/can't fill automatically/);
  });

  it("an OPTIONAL undrivable field does not block approval", () => {
    const withOptional = [...FORM, field({ id: "date", label: "Start date", type: "date" })];
    expect(approvalRefusal({ ...ready, formSchema: withOptional })).toBeNull();
  });

  it("closed beats unread-form in refusal order (status beats both)", () => {
    expect(
      approvalRefusal({ status: "needs_review", jobClosedAt: "2026-08-01T00:00:00Z", formSchema: null }),
    ).toBe("answer the required fields first");
    expect(approvalRefusal({ status: "draft", jobClosedAt: "2026-08-01T00:00:00Z", formSchema: null })).toMatch(
      /posting has closed/,
    );
  });
});

describe("mergeFieldEdits", () => {
  it("drops unknown field ids and converts empty string to null", () => {
    const merged = mergeFieldEdits(FORM, { name: "Ada" }, { email: "", injected: "x", cover: "hi" });
    expect(merged).toEqual({ name: "Ada", email: null, cover: "hi" });
  });
});

describe("computeUnresolved + reviewStatusFor", () => {
  it("an unanswered required field parks the application", () => {
    const unresolved = computeUnresolved(FORM, { name: "Ada", email: null, cover: null });
    expect(unresolved.map((u) => u.id).sort()).toEqual(["cover", "email"]);
    expect(reviewStatusFor(unresolved)).toBe("needs_review");
  });

  it("only optional gaps -> draft (approvable)", () => {
    const unresolved = computeUnresolved(FORM, { name: "Ada", email: "a@b.c", cover: null });
    expect(reviewStatusFor(unresolved)).toBe("draft");
  });

  it("resolution-excluded fields never count as gaps: file, resume_text, demographic", () => {
    const schema: Field[] = [
      field({ id: "name", required: true }),
      field({ id: "resume", label: "Resume", type: "file", required: true }),
      field({ id: "resume_text", label: "Paste your resume", type: "textarea", required: true }),
      field({ id: "gender", label: "Gender identity", required: true }),
    ];
    const unresolved = computeUnresolved(schema, { name: "Ada" });
    expect(unresolved).toEqual([]);
    expect(reviewStatusFor(unresolved)).toBe("draft");
  });
});
