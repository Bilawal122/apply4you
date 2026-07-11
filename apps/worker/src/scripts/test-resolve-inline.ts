import type { Field, ResolvedValues, Profile } from "@apply4you/shared";
import { greenhouseAdapter, type JobRef } from "@apply4you/ats";
import { resolveDeterministic, resolveFieldsWithLlm } from "@apply4you/ai";
import { loadProfileAndPrefs } from "../profile-data.js";

/**
 * Dev utility: run the exact resolve logic inline (no queue) against a live
 * Greenhouse form and report, per field, what value was chosen and whether it
 * is a legal option — the acid test of the no-fabrication guardrail.
 */
async function main(): Promise<void> {
  const userId = process.argv[2] ?? "3a10fe56-2456-415b-9746-4cf466ed3053";
  const { profile } = await loadProfileAndPrefs(userId);

  const job: JobRef = { atsType: "greenhouse", externalId: "7230670", boardSlug: "stripe", applyUrl: "" };
  const fields = await greenhouseAdapter.readForm(job);

  const resolvable = fields.filter((f) => f.type !== "file" && f.id !== "resume_text");
  const { resolved: deterministic, remaining } = resolveDeterministic(resolvable, profile as Profile);
  const llm = await resolveFieldsWithLlm(
    { profile: profile as Profile, job: { title: "Software Engineer, Data Orchestration", company: "Stripe", description: "" } },
    remaining,
  );
  const values: ResolvedValues = { ...deterministic, ...llm };

  let violations = 0;
  for (const f of resolvable) {
    const v = values[f.id] ?? null;
    let verdict = "ok";
    if (v !== null && (f.type === "select" || f.type === "radio") && f.options) {
      if (!f.options.includes(v)) {
        verdict = "*** FABRICATED — not in options ***";
        violations++;
      }
    }
    if (v !== null && f.type === "multiselect" && f.options) {
      const parts = v.split(" || ");
      if (!parts.every((p) => f.options!.includes(p))) {
        verdict = "*** FABRICATED multiselect ***";
        violations++;
      }
    }
    const shownVal = v === null ? "null" : v.slice(0, 40);
    console.log(`[${f.type}${f.required ? "*" : ""}] ${f.label.slice(0, 55)} => ${shownVal}  ${verdict}`);
  }
  console.log(`\nfabrication violations: ${violations}`);
  process.exit(violations === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
