import { afterEach, describe, expect, it, vi } from "vitest";
import { readGreenhouseForm } from "../src/greenhouse/form.js";

/**
 * The reader against the shape the board API actually returns. The fixture
 * mirrors Stripe req 7230670 as read live on 2026-09-02: a required location
 * block outside `questions`, hidden lat/long inputs, and `education` as a
 * top-level flag rather than a question. Before this test the reader saw only
 * `questions`, so all three required controls were invisible to resolution,
 * review and fill — and the fill would have submitted them blank.
 */
const question = (name: string, type: string, label: string, required = true, values: Array<{ label: string; value: number }> = []) => ({
  label,
  required,
  fields: [{ name, type, values }],
});

function stubJob(body: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

const JOB = { atsType: "greenhouse" as const, externalId: "7230670", boardSlug: "stripe", applyUrl: "https://example.com" };

afterEach(() => vi.unstubAllGlobals());

describe("readGreenhouseForm — location and education blocks", () => {
  it("maps the required location input to the live control id and skips the hidden lat/long", async () => {
    stubJob({
      questions: [question("first_name", "input_text", "First Name")],
      location_questions: [
        question("longitude", "input_hidden", "Longitude"),
        question("latitude", "input_hidden", "Latitude"),
        question("location", "input_text", "Location"),
      ],
      education: null,
    });
    const fields = await readGreenhouseForm(JOB);
    expect(fields.map((f) => f.id)).toEqual(["first_name", "candidate-location"]);
    expect(fields[1]).toMatchObject({ label: "Location", type: "text", required: true });
  });

  it("surfaces School and Degree as required selects when the form requires education", async () => {
    stubJob({ questions: [question("first_name", "input_text", "First Name")], education: "education_required" });
    const fields = await readGreenhouseForm(JOB);
    expect(fields.map((f) => f.id)).toEqual(["first_name", "school--0", "degree--0"]);
    for (const f of fields.slice(1)) {
      expect(f).toMatchObject({ type: "select", required: true });
      // No option list on purpose: schools are a searchable database and the
      // API exposes no degree list, so resolution must not pretend to validate.
      expect(f.options).toBeUndefined();
    }
  });

  it("leaves optional education alone — a blank is harmless, a guessed school on a real employer is not", async () => {
    stubJob({ questions: [question("first_name", "input_text", "First Name")], education: "education_optional" });
    const fields = await readGreenhouseForm(JOB);
    expect(fields.map((f) => f.id)).toEqual(["first_name"]);
  });

  it("a form with neither block reads exactly as before", async () => {
    stubJob({
      questions: [
        question("first_name", "input_text", "First Name"),
        question("question_1", "multi_value_single_select", "Sponsorship?", true, [{ label: "Yes", value: 1 }, { label: "No", value: 0 }]),
      ],
    });
    const fields = await readGreenhouseForm(JOB);
    expect(fields).toEqual([
      { id: "first_name", label: "First Name", type: "text", required: true, options: undefined },
      { id: "question_1", label: "Sponsorship?", type: "select", required: true, options: ["Yes", "No"] },
    ]);
  });
});
