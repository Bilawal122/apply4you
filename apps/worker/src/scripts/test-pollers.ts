import { NormalizedJobSchema } from "@apply4you/shared";
import { greenhouseAdapter, leverAdapter, ashbyAdapter, workableAdapter } from "@apply4you/ats";

/** Dev utility: verifies the pollers against live public boards. No DB needed. */
const CASES = [
  { adapter: greenhouseAdapter, slug: "stripe", company: "Stripe" },
  { adapter: leverAdapter, slug: "palantir", company: "Palantir" },
  { adapter: ashbyAdapter, slug: "openai", company: "OpenAI" },
  { adapter: workableAdapter, slug: "blueground", company: "Blueground" },
] as const;

async function main(): Promise<void> {
  for (const { adapter, slug, company } of CASES) {
    const jobs = await adapter.pollJobs(slug, { companyName: company });
    const sample = jobs[0];
    if (!sample) {
      console.log(`${adapter.atsType}/${slug}: 0 jobs (board empty?)`);
      continue;
    }
    NormalizedJobSchema.parse(sample); // schema conformance
    let enriched = sample;
    if (adapter.enrichJob) enriched = await adapter.enrichJob(slug, sample);
    console.log(
      `${adapter.atsType}/${slug}: ${jobs.length} jobs | sample: "${enriched.title}" @ ${enriched.company} | ${enriched.location ?? "-"} | desc ${enriched.description.length} chars | ${enriched.applyUrl}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
