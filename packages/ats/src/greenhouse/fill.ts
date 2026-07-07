import type { Page } from "playwright-core";
import type { Field, ResolvedValues, SubmitResult } from "@apply4you/shared";
import type { JobRef, LocalFile } from "../types.js";
import { cssEscape, detectCommonBlocks, humanPause, pickComboOption, typeInto } from "../fill-helpers.js";

const MULTI_SEP = "||";

/**
 * Canonical hosted form URL. absolute_url often points at the company's own
 * careers page; the Greenhouse-hosted form is always fillable here.
 */
export function greenhouseFillUrl(job: JobRef): string {
  return `https://job-boards.greenhouse.io/${job.boardSlug}/jobs/${job.externalId}`;
}

function controlFor(page: Page, fieldId: string) {
  // New UI uses id = question name; legacy uses name attr. Try both.
  return page.locator(`#${cssEscape(fieldId)}, [name="${fieldId}"]`).first();
}

export async function fillGreenhouseForm(
  page: Page,
  fields: Field[],
  values: ResolvedValues,
  resume: LocalFile,
): Promise<void> {
  for (const field of fields) {
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

    const value = values[field.id];
    if (value == null || value === "") continue;

    if (field.type === "select" || field.type === "multiselect") {
      const parts = field.type === "multiselect" ? value.split(MULTI_SEP).map((p) => p.trim()) : [value];
      const combo = page
        .locator(`[aria-labelledby*="${field.id}"], #${cssEscape(field.id)}, [name="${field.id}"]`)
        .first();
      for (const part of parts) {
        await pickComboOption(page, combo, part);
      }
      continue;
    }

    const control = controlFor(page, field.id);
    if ((await control.count()) === 0) continue;
    const tag = await control.evaluate((el: { tagName: string }) => el.tagName.toLowerCase()).catch(() => "input");
    if (tag === "select") {
      await control.selectOption({ label: value });
      await humanPause();
    } else {
      await typeInto(control, value);
    }
  }
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
