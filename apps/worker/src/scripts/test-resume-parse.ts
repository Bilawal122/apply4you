import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { parseResumePdf } from "@apply4you/ai";

/**
 * Dev utility: renders a realistic two-column resume PDF (real layout, not
 * fixture JSON) and runs it through the production Gemini parser, checking
 * the extraction against known-correct values.
 */

const RESUME_HTML = `<!doctype html><html><head><style>
  body { font-family: Georgia, serif; margin: 40px 50px; color: #222; font-size: 11px; }
  h1 { font-size: 22px; margin: 0; } .sub { color: #555; margin: 4px 0 14px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #999; padding-bottom: 2px; margin: 14px 0 6px; }
  .row { display: flex; justify-content: space-between; } .muted { color: #555; }
  ul { margin: 3px 0 8px 16px; padding: 0; } li { margin-bottom: 2px; }
  .cols { display: flex; gap: 30px; } .main { flex: 2; } .side { flex: 1; }
</style></head><body>
  <h1>Jordan Reyes</h1>
  <p class="sub">San Francisco, CA · +1 415 555 0182 · jordan.reyes@example.com<br/>
  linkedin.com/in/jordanreyes · github.com/jreyes · US citizen</p>
  <div class="cols"><div class="main">
    <h2>Experience</h2>
    <div class="row"><b>Senior Software Engineer — Acme Analytics</b><span class="muted">Mar 2021 – Present</span></div>
    <ul><li>Led migration of billing pipeline to event-driven architecture serving 40M events/day</li>
        <li>Cut p95 latency 40% by introducing partition-aware consumers</li>
        <li>Mentored four engineers; ran the platform on-call rotation</li></ul>
    <div class="row"><b>Software Engineer — DataCo</b><span class="muted">Jun 2018 – Feb 2021</span></div>
    <ul><li>Built ETL pipelines in Python and Airflow processing 2TB daily</li>
        <li>Designed Postgres schema powering the customer analytics dashboard</li></ul>
    <h2>Education</h2>
    <div class="row"><b>UC Berkeley — BS, Computer Science</b><span class="muted">Aug 2014 – May 2018</span></div>
  </div><div class="side">
    <h2>Skills</h2>
    <ul><li>TypeScript</li><li>Python</li><li>Postgres</li><li>AWS</li><li>Kafka</li><li>Distributed systems</li></ul>
  </div></div>
</body></html>`;

const EXPECTATIONS: Array<[string, (p: Record<string, unknown>) => boolean]> = [
  ["firstName Jordan", (p) => p.firstName === "Jordan"],
  ["lastName Reyes", (p) => p.lastName === "Reyes"],
  ["email", (p) => p.email === "jordan.reyes@example.com"],
  ["phone", (p) => typeof p.phone === "string" && p.phone.replace(/\D/g, "").endsWith("4155550182")],
  ["location SF", (p) => typeof p.location === "string" && /san francisco/i.test(p.location)],
  ["linkedin", (p) => JSON.stringify(p.links ?? {}).includes("jordanreyes")],
  ["github", (p) => JSON.stringify(p.links ?? {}).includes("jreyes")],
  ["work auth", (p) => typeof p.workAuthorization === "string" && /citizen/i.test(p.workAuthorization)],
  ["2 jobs", (p) => Array.isArray(p.workHistory) && p.workHistory.length === 2],
  [
    "acme current",
    (p) => {
      const jobs = p.workHistory as Array<{ company: string; end: string }>;
      return jobs?.some((j) => /acme/i.test(j.company) && j.end === "present");
    },
  ],
  [
    "dates ISO",
    (p) => {
      const jobs = p.workHistory as Array<{ start: string }>;
      return jobs?.every((j) => /^\d{4}-\d{2}/.test(j.start));
    },
  ],
  ["education", (p) => Array.isArray(p.education) && (p.education[0] as { school: string })?.school?.includes("Berkeley")],
  ["skills>=5", (p) => Array.isArray(p.skills) && p.skills.length >= 5],
];

async function main(): Promise<void> {
  const pdfPath = join(tmpdir(), "a4y-test-resume.pdf");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(RESUME_HTML);
  const pdf = await page.pdf({ format: "Letter" });
  await browser.close();
  writeFileSync(pdfPath, pdf);
  console.log(`rendered ${pdf.length} byte PDF`);

  const parsed = (await parseResumePdf(new Uint8Array(readFileSync(pdfPath)))) as Record<string, unknown>;
  console.log(JSON.stringify(parsed, null, 2).slice(0, 1500));

  let pass = 0;
  for (const [name, check] of EXPECTATIONS) {
    const ok = check(parsed);
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${EXPECTATIONS.length} checks passed`);
  if (pass < EXPECTATIONS.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
