import { describe, expect, it } from "vitest";
import { isWorkAuthorizationField, looksLikeRefusal, groundAnswer, ungroundedNumbers } from "../src/grounding.js";
import type { Field } from "../src/schemas/field.js";
import type { Profile } from "../src/schemas/profile.js";

const field = (id: string, label: string, type = "select"): Field =>
  ({ id, label, type, required: true }) as Field;

const profile = (workAuthorization: string): Profile =>
  ({
    firstName: "Bilawal", lastName: "Sami", email: "b@example.com", phone: "", location: "Bolton, United Kingdom",
    links: {}, workAuthorization, workHistory: [], projects: [], education: [], skills: [],
    summary: "", additionalInfo: "",
  }) as Profile;

/**
 * The nine questions below are the real ones from production packets that were
 * answered "No"/"Yes" against a profile whose workAuthorization is "". Each one
 * would have gone to a named employer as a statement about immigration status.
 */
const REAL_QUESTIONS = [
  "Are you legally authorized to work in the United Kingdom?",
  "Will you now or in the future require visa sponsorship to work in the UK?",
  "Will you require Stripe to sponsor you for a work permit now or in the future?",
  "Are you legally authorized to work in the country where the job is located?",
  "Will you now or in the future require company sponsorship to retain your work authorization?",
  "Will you now or in future require sponsorship of your right to work?",
  "Do you, now or in the future, require sponsorship to work in the country?",
  "Do you require sponsorship to work in UK/ EU?",
  "Are you authorized to work in the location(s) you selected?",
];

describe("isWorkAuthorizationField", () => {
  it.each(REAL_QUESTIONS)("recognises %s", (label) => {
    expect(isWorkAuthorizationField("q", label)).toBe(true);
  });

  it.each([
    "What is your notice period?",
    "Why do you want to work here?",
    "What are your salary expectations?",
    "How did you hear about us?",
    "What's your preferred approach to state management in React?",
  ])("does not fire on %s", (label) => {
    expect(isWorkAuthorizationField("q", label)).toBe(false);
  });
});

describe("groundAnswer — right-to-work claims need a profile fact", () => {
  it.each(REAL_QUESTIONS)("nulls the answer to %s when workAuthorization is empty", (label) => {
    expect(groundAnswer(profile(""), field("q", label), "No")).toBeNull();
    expect(groundAnswer(profile(""), field("q", label), "Yes")).toBeNull();
  });

  it("treats a MISSING workAuthorization as absent, without throwing", () => {
    // The résumé parser omits the key when the CV does not state it — which is
    // the normal case. This threw on a real parsed profile.
    const noKey = { ...profile("") } as Profile;
    delete (noKey as Partial<Profile>).workAuthorization;
    expect(() => groundAnswer(noKey, field("q", REAL_QUESTIONS[0]!), "No")).not.toThrow();
    expect(groundAnswer(noKey, field("q", REAL_QUESTIONS[0]!), "No")).toBeNull();
  });

  it("treats whitespace-only workAuthorization as absent", () => {
    expect(groundAnswer(profile("   "), field("q", REAL_QUESTIONS[0]!), "Yes")).toBeNull();
  });

  it("allows the answer once the profile actually states it", () => {
    const p = profile("British citizen — no sponsorship required");
    expect(groundAnswer(p, field("q", REAL_QUESTIONS[0]!), "Yes")).toBe("Yes");
    expect(groundAnswer(p, field("q", REAL_QUESTIONS[1]!), "No")).toBe("No");
  });

  it("never blocks ordinary questions", () => {
    expect(groundAnswer(profile(""), field("q", "What is your notice period?", "text"), "1 month")).toBe("1 month");
  });

  it("passes null straight through", () => {
    expect(groundAnswer(profile("British citizen"), field("q", REAL_QUESTIONS[0]!), null)).toBeNull();
  });
});

describe("looksLikeRefusal", () => {
  it("catches the answer ClickHouse would have received", () => {
    expect(
      looksLikeRefusal(
        "The profile does not contain information about preferred state management approaches in React or the reasoning behind them.",
      ),
    ).toBe(true);
  });

  it.each([
    "As an AI, I cannot answer this question.",
    "This is not specified in the profile.",
    "I do not have enough information to answer.",
    "Based on the provided profile, there is no evidence of this.",
  ])("catches %s", (t) => expect(looksLikeRefusal(t)).toBe(true));

  it.each([
    "I led the migration of a billing pipeline to an event-driven architecture.",
    "My profile as an engineer is mostly backend, though I enjoy front-end work.",
    "I do not have a preference between remote and hybrid.",
    "React, TypeScript and Postgres.",
  ])("does not fire on the genuine answer %s", (t) => expect(looksLikeRefusal(t)).toBe(false));

  it("nulls refusal prose through groundAnswer even with a grounded profile", () => {
    const f = field("q", "What's your preferred approach to state management?", "textarea");
    expect(groundAnswer(profile("British citizen"), f, "The profile does not contain information about that.")).toBeNull();
  });
});

describe("ungroundedNumbers — the free-text backstop", () => {
  const p = profile("");
  const withNumbers = {
    ...profile(""),
    workHistory: [{ company: "Acme", title: "Engineer", start: "2021-03", end: "present",
      bullets: ["Cut p95 latency 40%", "Mentored 3 engineers"] }],
    skills: ["TypeScript"],
  } as Profile;

  it("passes a figure the profile actually states", () => {
    expect(ungroundedNumbers("I cut p95 latency by 40%.", withNumbers)).toEqual([]);
  });

  it("catches an invented percentage", () => {
    expect(ungroundedNumbers("I cut costs by 65%.", withNumbers)).toEqual(["65%"]);
  });

  it("catches an invented headcount and an invented scale", () => {
    const out = ungroundedNumbers("I led 12 engineers and scaled to 250,000 users.", withNumbers);
    expect(out).toContain("12");
    expect(out).toContain("250,000");
  });

  it("ignores single digits — not metric claims", () => {
    expect(ungroundedNumbers("I worked across 3 teams on 4 services.", p)).toEqual([]);
  });

  it("ignores number words entirely", () => {
    expect(ungroundedNumbers("Two years across three projects.", p)).toEqual([]);
  });

  it("ignores bare years — flagging one costs a whole letter", () => {
    expect(ungroundedNumbers("I shipped in 2024 and joined in 1998.", p)).toEqual([]);
  });

  it("still catches a percentage that happens to look like a year", () => {
    expect(ungroundedNumbers("Throughput rose 2024%.", p)).toEqual(["2024%"]);
  });

  it("matches digits inside profile dates, so real dates pass", () => {
    expect(ungroundedNumbers("Since 03/2021 I have owned the billing pipeline.", withNumbers)).toEqual([]);
  });
});

describe("groundAnswer — number fields must be grounded", () => {
  const withNumbers = {
    ...profile("British citizen"),
    workHistory: [{ company: "Acme", title: "Engineer", start: "2021-03", end: "present", bullets: ["Cut latency 40%"] }],
  } as Profile;
  const numField = { id: "yrs", label: "How many years of React experience?", type: "number", required: true } as Field;

  it("nulls an invented figure", () => {
    expect(groundAnswer(withNumbers, numField, "15")).toBeNull();
  });

  it("allows a figure the profile states", () => {
    expect(groundAnswer(withNumbers, numField, "40")).toBe("40");
  });

  it("leaves single digits alone — too common to police", () => {
    expect(groundAnswer(withNumbers, numField, "3")).toBe("3");
  });

  it("does not touch non-number fields", () => {
    const text = { id: "q", label: "Why this role?", type: "textarea", required: false } as Field;
    expect(groundAnswer(withNumbers, text, "I scaled it to 250,000 users.")).toBe("I scaled it to 250,000 users.");
  });
});
