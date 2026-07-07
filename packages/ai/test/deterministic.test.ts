import { describe, expect, it } from "vitest";
import type { Field } from "@apply4you/shared";
import { resolveDeterministic } from "../src/deterministic.js";
import { postValidate, MULTI_VALUE_SEPARATOR } from "../src/prompts/field-resolution.js";
import { FIXTURE_PROFILE } from "./fixtures.js";

const f = (partial: Partial<Field> & Pick<Field, "id" | "label" | "type">): Field => ({
  required: false,
  ...partial,
});

describe("resolveDeterministic (FR-12)", () => {
  it("resolves standard contact fields without an LLM", () => {
    const fields: Field[] = [
      f({ id: "first_name", label: "First Name", type: "text", required: true }),
      f({ id: "last_name", label: "Last Name", type: "text", required: true }),
      f({ id: "email", label: "Email", type: "email", required: true }),
      f({ id: "phone", label: "Phone", type: "phone" }),
      f({ id: "urls[LinkedIn]", label: "LinkedIn URL", type: "text" }),
      f({ id: "urls[GitHub]", label: "GitHub URL", type: "text" }),
      f({ id: "location", label: "Current location", type: "text", required: true }),
    ];
    const { resolved, remaining } = resolveDeterministic(fields, FIXTURE_PROFILE);
    expect(resolved["first_name"]).toBe("Jordan");
    expect(resolved["last_name"]).toBe("Reyes");
    expect(resolved["email"]).toBe("jordan.reyes@example.com");
    expect(resolved["phone"]).toBe("+1 415 555 0182");
    expect(resolved["urls[LinkedIn]"]).toBe("https://linkedin.com/in/jordanreyes");
    expect(resolved["urls[GitHub]"]).toBe("https://github.com/jreyes");
    expect(resolved["location"]).toBe("San Francisco, CA");
    expect(remaining).toHaveLength(0);
  });

  it("resolves Lever-style full name", () => {
    const { resolved } = resolveDeterministic([f({ id: "name", label: "Full name", type: "text" })], FIXTURE_PROFILE);
    expect(resolved["name"]).toBe("Jordan Reyes");
  });

  it("leaves unknown questions for the LLM", () => {
    const fields: Field[] = [
      f({ id: "q1", label: "Why do you want to work here?", type: "textarea" }),
      f({ id: "q2", label: "What is your salary expectation?", type: "text" }),
    ];
    const { resolved, remaining } = resolveDeterministic(fields, FIXTURE_PROFILE);
    expect(Object.keys(resolved)).toHaveLength(0);
    expect(remaining).toHaveLength(2);
  });

  it("never resolves a portfolio the profile does not have", () => {
    const { resolved, remaining } = resolveDeterministic(
      [f({ id: "urls[Portfolio]", label: "Portfolio URL", type: "text" })],
      FIXTURE_PROFILE,
    );
    expect(resolved["urls[Portfolio]"]).toBeUndefined();
    expect(remaining).toHaveLength(1); // LLM must return null for it (no profile fact)
  });

  it("skips file fields entirely", () => {
    const { resolved, remaining } = resolveDeterministic(
      [f({ id: "resume", label: "Resume/CV", type: "file", required: true })],
      FIXTURE_PROFILE,
    );
    expect(Object.keys(resolved)).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it("defers to the LLM when a select's options don't contain the profile value", () => {
    const { resolved, remaining } = resolveDeterministic(
      [f({ id: "location_select", label: "Location", type: "select", options: ["New York", "Remote"], required: true })],
      FIXTURE_PROFILE,
    );
    expect(Object.keys(resolved)).toHaveLength(0);
    expect(remaining).toHaveLength(1);
  });
});

describe("postValidate (FR-14 structural guarantees)", () => {
  it("canonicalizes case-insensitive select matches", () => {
    const field = f({ id: "s", label: "Country", type: "select", options: ["United States", "Canada"] });
    expect(postValidate(field, "united states")).toBe("United States");
  });

  it("nulls select values not present in options — no fabricated choices", () => {
    const field = f({ id: "s", label: "Country", type: "select", options: ["United States", "Canada"] });
    expect(postValidate(field, "Mexico")).toBeNull();
  });

  it("validates every part of a multiselect answer", () => {
    const field = f({ id: "m", label: "Languages", type: "multiselect", options: ["English (ENG)", "Spanish (SPA)"] });
    expect(postValidate(field, `English (ENG)${MULTI_VALUE_SEPARATOR}Klingon`)).toBe("English (ENG)");
    expect(postValidate(field, "Klingon")).toBeNull();
  });

  it("respects maxLength with word-boundary truncation", () => {
    const field = f({ id: "t", label: "Answer", type: "text", maxLength: 20 });
    const out = postValidate(field, "one two three four five six");
    expect(out!.length).toBeLessThanOrEqual(20);
    expect(out!.endsWith(" ")).toBe(false);
  });

  it("treats empty and whitespace answers as null", () => {
    const field = f({ id: "t", label: "Answer", type: "text" });
    expect(postValidate(field, "")).toBeNull();
    expect(postValidate(field, "   ")).toBeNull();
    expect(postValidate(field, null)).toBeNull();
  });
});
