import { writeFileSync } from "node:fs";
import { resolveTailoredCv, type Profile, type TailoredCv } from "@apply4you/shared";
import { renderCvHtml, renderCvPdf } from "../packet/render-cv.js";

/**
 * Verifies the no-fabrication guarantee of the tailored CV (task #40).
 *
 * The whole design rests on one claim: because the model returns indices
 * rather than prose, a hallucinated selection cannot put words in the
 * candidate's CV that the candidate did not write. This asserts that against
 * a deliberately adversarial selection, then renders a real PDF.
 *
 * Run: pnpm exec tsx src/scripts/verify-tailored-cv.ts [out.pdf]
 */

const PROFILE: Profile = {
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan.reyes@example.com",
  phone: "+1 415 555 0182",
  location: "San Francisco, CA",
  links: { linkedin: "https://linkedin.com/in/jordanreyes", github: "https://github.com/jreyes" },
  workAuthorization: "US citizen",
  workHistory: [
    {
      company: "Acme Analytics",
      title: "Senior Software Engineer",
      start: "2021-03",
      end: "present",
      bullets: [
        "Led migration of billing pipeline to event-driven architecture",
        "Cut p95 latency 40%",
        "Mentored three junior engineers",
      ],
    },
    {
      company: "DataCo",
      title: "Software Engineer",
      start: "2018-06",
      end: "2021-02",
      bullets: ["Built ETL pipelines in Python and Airflow"],
    },
  ],
  education: [{ school: "UC Berkeley", degree: "BS", field: "Computer Science", start: "2014-08", end: "2018-05" }],
  skills: ["TypeScript", "Python", "Postgres", "AWS"],
  summary: "Software engineer with 8 years of experience in data infrastructure and backend systems.",
  additionalInfo: "",
};

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  console.log("\n1. Adversarial selection: every index out of range or duplicated");
  const adversarial: TailoredCv = {
    summary: "Tailored summary grounded in the profile.",
    roles: [
      { index: 99, bulletIndices: [0] }, // role that does not exist
      { index: 0, bulletIndices: [0, 0, 42] }, // real role, dup + bogus bullet
      { index: 0, bulletIndices: [1] }, // duplicate role
      { index: -1, bulletIndices: [0] }, // negative
    ],
    skillIndices: [0, 0, 77, -3],
    educationIndices: [0, 5],
    rationale: "Led with the billing work.",
  };

  const resolved = resolveTailoredCv(PROFILE, adversarial);
  const allBullets = resolved.roles.flatMap((r) => r.bullets);
  const realBullets = new Set(PROFILE.workHistory.flatMap((r) => r.bullets));
  const realCompanies = new Set(PROFILE.workHistory.map((r) => r.company));

  check("no invented role appears", resolved.roles.every((r) => realCompanies.has(r.company)),
    JSON.stringify(resolved.roles.map((r) => r.company)));
  check("no invented bullet appears", allBullets.every((b) => realBullets.has(b)));
  check("duplicate role collapsed to one entry", resolved.roles.filter((r) => r.company === "Acme Analytics").length === 1,
    `got ${resolved.roles.length} roles`);
  check("out-of-range bullet dropped", allBullets.length === 1 && allBullets[0] === PROFILE.workHistory[0]!.bullets[0]);
  check("bogus + duplicate skills dropped", JSON.stringify(resolved.skills) === JSON.stringify(["TypeScript"]),
    JSON.stringify(resolved.skills));
  check("out-of-range education dropped", resolved.education.length === 1);

  console.log("\n2. Empty selection degrades to the full profile, not a blank CV");
  const empty = resolveTailoredCv(PROFILE, {
    summary: "", roles: [], skillIndices: [], educationIndices: [], rationale: "",
  });
  check("all roles restored", empty.roles.length === PROFILE.workHistory.length);
  check("all skills restored", empty.skills.length === PROFILE.skills.length);
  check("summary falls back to the profile's own", empty.summary === PROFILE.summary);

  console.log("\n3. A role selected with no valid bullets keeps its own bullets");
  const noBullets = resolveTailoredCv(PROFILE, {
    summary: "x", roles: [{ index: 1, bulletIndices: [88] }], skillIndices: [1], educationIndices: [0], rationale: "",
  });
  check("role kept with its real bullets", noBullets.roles[0]?.bullets.length === 1
    && noBullets.roles[0]?.bullets[0] === PROFILE.workHistory[1]!.bullets[0]);

  console.log("\n4. Rendered HTML contains only the candidate's own strings");
  const html = renderCvHtml(PROFILE, resolved);
  check("contains the candidate's name", html.includes("Jordan Reyes"));
  check("contains a selected real bullet", html.includes("Led migration of billing pipeline"));
  check("does NOT contain a dropped role", !html.includes("DataCo"));
  check("dates humanised", html.includes("Mar 2021"));
  check("no hardcoded founder details leaked from the old script",
    !/Bilawal|Edge Hill|Bolton/i.test(html));

  console.log("\n5. Renders a real PDF");
  const out = process.argv[2] ?? "tailored-cv.pdf";
  const pdf = await renderCvPdf(PROFILE, resolved);
  writeFileSync(out, pdf);
  check("PDF has a valid header", pdf.subarray(0, 5).toString() === "%PDF-");
  check("PDF is a plausible size", pdf.length > 5000, `${pdf.length} bytes`);
  console.log(`  wrote ${pdf.length} bytes to ${out}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
