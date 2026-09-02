import type { Page } from "playwright-core";
import type { Field, ResolvedValues, SubmitResult } from "@apply4you/shared";
import { JobRef, LocalFile, type FillFailure, type FillReport } from "../types.js";
import { cssEscape, detectCommonBlocks, humanPause, pickComboOption, resolveControl, typeInto } from "../fill-helpers.js";

const MULTI_SEP = "||";

/**
 * Canonical fillable form URL: the embed application endpoint. Companies that
 * redirect their hosted board to their own careers site (e.g. Stripe) still
 * serve the raw form here — verified live 2026-07.
 */
export function greenhouseFillUrl(job: JobRef): string {
  return `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(job.boardSlug)}&token=${encodeURIComponent(job.externalId)}`;
}

function controlFor(page: Page, fieldId: string) {
  // New UI uses id = question name; legacy uses name attr. Try both.
  return page.locator(`[id="${fieldId}"], [name="${fieldId}"]`).first();
}

export async function fillGreenhouseForm(
  page: Page,
  fields: Field[],
  values: ResolvedValues,
  resume: LocalFile,
): Promise<FillReport> {
  const failed: FillFailure[] = [];
  for (const field of fields) {
    // One awkward control must never abort the whole application: fill what we
    // can. A required field left empty surfaces as a submit validation error,
    // recorded with an "apply manually" link — never a silent wrong answer.
    //
    // The try MUST open before the file branch. It used to open only around
    // fillOneField, so a throwing setInputFiles escaped the loop and killed the
    // whole submission — on the one ATS cleared for real submissions (D3).
    // Lever, Ashby and Workable all open theirs here; Greenhouse now matches.
    try {
      if (field.type === "file") {
        if (field.id === "resume") {
          const fileInput = page.locator('input[type="file"]').first();
          await fileInput.setInputFiles(resume.path);
          // Greenhouse parses the resume and may autofill fields. Wait, then let
          // our values overwrite anything it filled (profile is source of truth).
          await humanPause(2500, 4000);
        }
        continue;
      }

      // Demographic values reach here only if the APPLICANT typed them in
      // review (resolution never generates them — DECISIONS.md D3); a value the
      // user chose to give is theirs to deliver, so fill does not re-filter.
      const value = values[field.id];
      if (value == null || value === "") continue;

      await fillOneField(page, field, value);
    } catch (err) {
      console.error(`[greenhouse fill] ${field.id} (${field.label.slice(0, 50)}) failed: ${String(err).slice(0, 120)}`);
      failed.push({ id: field.id, label: field.label, reason: String(err).slice(0, 120) });
    }
  }
  return { failed };
}

async function fillOneField(page: Page, field: Field, value: string): Promise<void> {
  if (field.type === "multiselect") {
    const parts = value.split(MULTI_SEP).map((p) => p.trim());
    // Greenhouse renders multi_value_multi_select as a checkbox group, not a
    // combobox. Check by accessible name (the country/option label).
    const group = page.locator(`[id="${field.id}"]`).first();
    const isCheckboxGroup = (await page.locator(`input[type="checkbox"][name="${field.id}"]`).count()) > 0;
    if (isCheckboxGroup) {
      for (const part of parts) {
        const box = group.getByRole("checkbox", { name: part, exact: true }).first();
        if ((await box.count()) > 0) {
          await box.scrollIntoViewIfNeeded().catch(() => undefined);
          await box.check().catch(() => box.click());
          await humanPause(80, 200);
        }
      }
      return;
    }
    // Fallback: react-select multi combobox.
    const combo = await resolveControl(page, field.id);
    for (const part of parts) await pickComboOption(page, combo, part);
    return;
  }

  if (field.type === "select") {
    // Native <select> first. Greenhouse's current UI renders a react-select
    // combobox, but its embedded/legacy forms render a real <select> — the same
    // split controlFor() already accounts for — and this branch went straight to
    // pickComboOption, which waits for a listbox option that never appears. Every
    // dropdown on such a form was left empty: caught by the per-field catch, so
    // it surfaced only as the employer's own "required field" validation error.
    const native = page.locator(`select[id="${field.id}"], select[name="${field.id}"]`).first();
    if ((await native.count()) > 0) {
      await native.selectOption({ label: value }).catch(() => native.selectOption(value));
      await humanPause();
      return;
    }
    const combo = await resolveControl(page, field.id);
    await pickComboOption(page, combo, value);
    return;
  }

  const control = controlFor(page, field.id);
  if ((await control.count()) === 0) return;
  const tag = await control.evaluate((el: { tagName: string }) => el.tagName.toLowerCase()).catch(() => "input");
  if (tag === "select") {
    await control.selectOption({ label: value });
    await humanPause();
    return;
  }
  // An autocomplete text input (the candidate location box) only validates
  // once a suggestion is chosen: `fill()` sets the text without firing the
  // lookup, and Greenhouse then rejects the form with "select a location from
  // the list". Type it like a person and take the first suggestion.
  const role = await control.getAttribute("role").catch(() => null);
  if (role === "combobox") {
    await typeInto(control, value, { reactSafe: true });
    const suggestion = page.getByRole("option").first();
    const appeared = await suggestion
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      await suggestion.click({ timeout: 3000 }).catch(() => undefined);
      await humanPause();
    }
    return;
  }
  await typeInto(control, value);
}

export async function submitGreenhouse(page: Page): Promise<SubmitResult> {
  const button = page
    .getByRole("button", { name: /submit application/i })
    .or(page.locator('button[type="submit"], input[type="submit"]'))
    .first();
  await button.click();

  try {
    await Promise.race([
      page.waitForURL(/confirmation/i, { timeout: 20_000 }),
      page.getByText(/thank you for applying|application (was )?submitted/i).first().waitFor({ timeout: 20_000 }),
    ]);
    return { outcome: "submitted" };
  } catch {
    const block = await detectCommonBlocks(page);
    if (block) return { outcome: "failed", reason: block === "captcha" ? "captcha" : "bot_wall" };
    const errorText = await page
      .locator('[class*="error"], [role="alert"]')
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => "");
    return {
      outcome: "failed",
      reason: errorText ? "form_error" : "confirmation_timeout",
      detail: errorText.slice(0, 300) || undefined,
    };
  }
}
