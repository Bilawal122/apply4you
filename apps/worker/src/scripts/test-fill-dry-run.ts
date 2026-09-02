import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import type { Field, ResolvedValues } from "@apply4you/shared";
import { greenhouseAdapter, type JobRef } from "@apply4you/ats";
import { supabaseAdmin } from "../supabase.js";
import { diffFormSchema } from "../preflight.js";

/**
 * Dev utility: DRY-RUN fill of a real Greenhouse form. Types into the live
 * page exactly as the submit worker would, then STOPS — the submit button is
 * never clicked. Verifies locators, combobox handling, and file upload.
 *
 * `--fresh` re-reads the live form first and diffs it against the stored
 * schema, the same check the submit worker now runs, then fills from the live
 * schema. Without it the run fills from `form_schema` as stored — useful for
 * reproducing what an old application would have done.
 */

const APPLICATION_ID = process.argv.find((a) => !a.startsWith("--") && /^[0-9a-f-]{36}$/.test(a)) ?? "93fd3d71-1e27-4cf3-87e5-4c76e285d89d";
const FRESH = process.argv.includes("--fresh");

/** Dry-run stand-ins for controls the synthetic profile has no answer for. Never written back. */
const DRY_RUN_STUBS: Record<string, string> = {
  "candidate-location": "San Francisco, CA",
  "school--0": "Stanford University",
  "degree--0": "Bachelor's Degree",
};

async function main(): Promise<void> {
  const db = supabaseAdmin();
  const { data: app } = await db
    .from("applications")
    .select("form_schema, resolved_fields, jobs!inner(ats_type, external_id, apply_url, board_sources(slug))")
    .eq("id", APPLICATION_ID)
    .single();
  if (!app) throw new Error("application not found");

  const jobRow = app.jobs as unknown as {
    ats_type: string;
    external_id: string;
    apply_url: string;
    board_sources: { slug: string } | null;
  };
  let fields = (app.form_schema ?? []) as Field[];
  const values = { ...(app.resolved_fields ?? {}) } as ResolvedValues;

  // Dry-run only: pretend the user answered the two open questions so we can
  // exercise every control type. Nothing is written back or submitted.
  for (const f of fields) {
    if (f.required && (values[f.id] ?? null) === null && f.options?.length) {
      values[f.id] = f.options[0]!;
    }
  }

  const jobRef: JobRef = {
    atsType: "greenhouse",
    externalId: jobRow.external_id,
    applyUrl: jobRow.apply_url,
    boardSlug: jobRow.board_sources?.slug ?? "stripe",
  };
  if (FRESH) {
    const live = await greenhouseAdapter.readForm(jobRef);
    const drift = diffFormSchema(fields, live, values);
    console.log(
      `form drift vs stored schema: +${drift.added.length} added, -${drift.removed.length} removed, ${drift.newRequiredUnanswered.length} new required unanswered`,
    );
    for (const f of drift.added) console.log(`  + [${f.type}${f.required ? "*" : ""}] ${f.id} :: ${f.label.slice(0, 60)}`);
    for (const f of drift.removed) console.log(`  - [${f.type}${f.required ? "*" : ""}] ${f.id} :: ${f.label.slice(0, 60)}`);
    if (drift.newRequiredUnanswered.length > 0) {
      console.log("  (the submit worker would park this application for review here — dry run continues with stubs)");
      for (const f of drift.newRequiredUnanswered) if (DRY_RUN_STUBS[f.id]) values[f.id] = DRY_RUN_STUBS[f.id]!;
    }
    fields = drift.fields;
  }

  const url = greenhouseAdapter.fillUrl!(jobRef);
  console.log(`opening ${url}`);

  const resumePath = join(tmpdir(), "a4y-test-resume.pdf");
  readFileSync(resumePath); // fails loudly if the parse test hasn't rendered it

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    const block = await greenhouseAdapter.detectBlock(page);
    console.log(`pre-fill block check: ${block ?? "none"}`);
    if (block) throw new Error(`blocked before filling: ${block}`);

    await greenhouseAdapter.fillForm(
      page,
      fields,
      values,
      { path: resumePath, filename: "Jordan-Reyes-Resume.pdf", mimeType: "application/pdf" },
    );

    // Read back what actually landed in the DOM. (Runs in the browser; cast to
    // avoid pulling DOM lib types into the worker's Node tsconfig.)
    const readBack = await page.evaluate(
      "(() => { const out = {}; document.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => { if (el.value && el.type !== 'file') out[el.id] = el.value.slice(0, 60); }); return out; })()",
    );
    console.log("DOM read-back:", JSON.stringify(readBack, null, 2));

    const shot = await page.screenshot({ fullPage: true });
    const shotPath = join(tmpdir(), "a4y-dry-run-fill.png");
    writeFileSync(shotPath, shot);
    console.log(`screenshot: ${shotPath}`);
    console.log("DRY RUN COMPLETE — submit was never clicked.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
