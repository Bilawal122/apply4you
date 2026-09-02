import { FieldSchema } from "@apply4you/shared";
import { greenhouseAdapter, leverAdapter, ashbyAdapter, workableAdapter, type JobRef } from "@apply4you/ats";

/**
 * Dev utility: verifies readForm() against live public postings. No DB needed.
 *
 * The job refs are discovered by polling each board at run time rather than
 * hardcoded. Hardcoded ids rot the moment the employer closes the posting,
 * and the failure looks exactly like a broken form reader: this script died
 * on a Stripe 404 for a req that no longer exists, while all four adapters
 * were in fact fine.
 *
 * Each adapter is also isolated. The previous version threw out of main() on
 * the first failure, so one dead posting hid the other three adapters
 * completely — the run told you nothing about lever, ashby, or workable.
 */
const CASES = [
  { adapter: greenhouseAdapter, slug: "stripe", company: "Stripe" },
  { adapter: leverAdapter, slug: "palantir", company: "Palantir" },
  { adapter: ashbyAdapter, slug: "openai", company: "OpenAI" },
  { adapter: workableAdapter, slug: "blueground", company: "Blueground" },
] as const;

async function main(): Promise<void> {
  let failed = 0;

  for (const { adapter, slug, company } of CASES) {
    try {
      const jobs = await adapter.pollJobs(slug, { companyName: company });
      const sample = jobs[0];
      if (!sample) {
        console.log(`\n=== ${adapter.atsType} — SKIP (board ${slug} returned 0 jobs) ===`);
        continue;
      }

      const job: JobRef = {
        atsType: sample.atsType,
        externalId: sample.externalId,
        boardSlug: slug,
        applyUrl: sample.applyUrl,
      };

      const fields = await adapter.readForm(job);
      fields.forEach((f) => FieldSchema.parse(f));

      console.log(`\n=== ${adapter.atsType} (${fields.length} fields) — "${sample.title}" [${sample.externalId}] ===`);
      for (const f of fields) {
        const opts = f.options ? ` options=[${f.options.slice(0, 3).join("|")}${f.options.length > 3 ? "…" : ""}]` : "";
        console.log(`  [${f.type}${f.required ? "*" : ""}] ${f.id} :: ${f.label.slice(0, 70)}${opts}${f.maxLength ? ` max=${f.maxLength}` : ""}`);
      }
      if (fields.length === 0) {
        failed++;
        console.error(`  FAIL  ${adapter.atsType}: readForm returned 0 fields for a live posting`);
      }
    } catch (err) {
      failed++;
      console.error(`\n=== ${adapter.atsType} — FAIL ===`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} adapter(s) FAILED`);
    process.exit(1);
  }
  console.log("all adapters read a live form successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
