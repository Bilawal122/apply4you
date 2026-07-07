import { FieldSchema } from "@apply4you/shared";
import { greenhouseAdapter, leverAdapter, ashbyAdapter, workableAdapter, type JobRef } from "@apply4you/ats";

/** Dev utility: verifies readForm() against live public postings. No DB needed. */
const CASES: Array<{ adapter: typeof greenhouseAdapter; job: JobRef }> = [
  {
    adapter: greenhouseAdapter,
    job: { atsType: "greenhouse", externalId: "7954688", boardSlug: "stripe", applyUrl: "https://stripe.com/jobs/search?gh_jid=7954688" },
  },
  {
    adapter: leverAdapter,
    job: {
      atsType: "lever",
      externalId: "0bbfd4f4-41ff-4ec6-b73f-5200efd5d4d3",
      boardSlug: "palantir",
      applyUrl: "https://jobs.lever.co/palantir/0bbfd4f4-41ff-4ec6-b73f-5200efd5d4d3/apply",
    },
  },
  {
    adapter: ashbyAdapter,
    job: {
      atsType: "ashby",
      externalId: "00207abc-49b7-465c-a219-f7c1140f8047",
      boardSlug: "openai",
      applyUrl: "https://jobs.ashbyhq.com/openai/00207abc-49b7-465c-a219-f7c1140f8047/application",
    },
  },
  {
    adapter: workableAdapter,
    job: { atsType: "workable", externalId: "38ABFA8E0D", boardSlug: "blueground", applyUrl: "https://apply.workable.com/blueground/j/38ABFA8E0D/" },
  },
];

async function main(): Promise<void> {
  for (const { adapter, job } of CASES) {
    const fields = await adapter.readForm(job);
    fields.forEach((f) => FieldSchema.parse(f));
    console.log(`\n=== ${adapter.atsType} (${fields.length} fields) ===`);
    for (const f of fields) {
      const opts = f.options ? ` options=[${f.options.slice(0, 3).join("|")}${f.options.length > 3 ? "…" : ""}]` : "";
      console.log(`  [${f.type}${f.required ? "*" : ""}] ${f.id} :: ${f.label.slice(0, 70)}${opts}${f.maxLength ? ` max=${f.maxLength}` : ""}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
