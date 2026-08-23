import { describe, expect, it } from "vitest";
import { isExcludedFromResolution, isDemographicField, FILLABLE_FIELD_TYPES } from "../src/constants.js";

type F = { id: string; label: string; type: string; required?: boolean };
const f = (id: string, label: string, type: string, required = false): F => ({ id, label, type, required });

/**
 * The regression net for the defect this predicate exists to prevent: the web
 * save action and the worker resolver each carrying their own idea of what
 * resolution skips. When they disagreed, a Greenhouse application could never
 * be approved while the UI reported it ready to send.
 */
describe("isExcludedFromResolution", () => {
  it("excludes file uploads — the fill layer handles them", () => {
    expect(isExcludedFromResolution(f("resume", "Resume/CV", "file", true))).toBe(true);
  });

  it("excludes Greenhouse's paste-resume textarea", () => {
    expect(isExcludedFromResolution(f("resume_text", "Resume/CV", "textarea", true))).toBe(true);
  });

  it("excludes demographic questions on any ATS (D3.5)", () => {
    for (const field of [
      f("gender", "Gender", "select"),
      f("eeo[race]", "Race", "select"),
      f("veteranStatus", "Veteran status", "select"),
      f("date_of_birth", "Date of birth", "text"),
    ]) {
      expect(isExcludedFromResolution(field), field.id).toBe(true);
    }
  });

  it("does NOT exclude ordinary employer questions", () => {
    for (const field of [
      f("first_name", "First Name", "text", true),
      f("q_sponsor", "Will you require sponsorship?", "select", true),
      f("cover_letter", "Cover letter", "textarea"),
      f("notice", "What is your notice period?", "text"),
    ]) {
      expect(isExcludedFromResolution(field), field.id).toBe(false);
    }
  });

  /**
   * The exact production shape. Resolve reported "0 unresolved" for this draft;
   * the save action's narrower rule then found resume_text null and required,
   * flipped it to needs_review, and approval refused forever.
   */
  it("a fully-answered Greenhouse form has no unresolved required fields", () => {
    const schema: F[] = [
      f("resume", "Resume/CV", "file", true),
      f("resume_text", "Resume/CV", "textarea", true),
      f("first_name", "First Name", "text", true),
      f("last_name", "Last Name", "text", true),
      f("email", "Email", "email", true),
      f("gender", "Gender", "select"),
    ];
    const resolved: Record<string, string | null> = {
      first_name: "Bilawal", last_name: "Sami", email: "b@example.com",
      resume: null, resume_text: null, gender: null,
    };

    const unresolved = schema.filter((x) => !isExcludedFromResolution(x) && (resolved[x.id] ?? null) === null);
    expect(unresolved).toHaveLength(0);
    expect(unresolved.some((x) => x.required)).toBe(false); // ⇒ status stays "draft" ⇒ approvable
  });

  it("still parks when a genuine required question is unanswered", () => {
    const schema: F[] = [
      f("resume_text", "Resume/CV", "textarea", true),
      f("q_sponsor", "Will you require sponsorship?", "select", true),
    ];
    const resolved: Record<string, string | null> = { resume_text: null, q_sponsor: null };
    const unresolved = schema.filter((x) => !isExcludedFromResolution(x) && (resolved[x.id] ?? null) === null);
    expect(unresolved.map((x) => x.id)).toEqual(["q_sponsor"]);
    expect(unresolved.some((x) => x.required)).toBe(true); // ⇒ needs_review, correctly
  });
});

describe("isDemographicField word boundaries", () => {
  it.each(["trace elements experience", "Can you embrace ambiguity?", "Does this role engender excitement?"])(
    "does not fire on %s",
    (label) => expect(isDemographicField("q1", label)).toBe(false),
  );
  it.each(["genderIdentity", "raceEthnicity", "veteran_status", "Voluntary Self-Identification of Disability"])(
    "fires on %s",
    (v) => expect(isDemographicField(v, v)).toBe(true),
  );
});

describe("FILLABLE_FIELD_TYPES", () => {
  it("covers every type the exclusion predicate lets through to a real form", () => {
    for (const t of ["text", "textarea", "select", "multiselect", "radio", "email", "phone", "number"]) {
      expect(FILLABLE_FIELD_TYPES.has(t), t).toBe(true);
    }
  });
});
