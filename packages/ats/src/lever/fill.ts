import type { Page } from "playwright-core";
import type { Field, ResolvedValues, SubmitResult } from "@apply4you/shared";
import type { LocalFile } from "../types.js";
import { detectCommonBlocks, humanPause, typeInto } from "../fill-helpers.js";

const MULTI_SEP = "||";

/** Lever apply pages are plain server-rendered HTML forms — the simplest of the four. */
export async function fillLeverForm(
  page: Page,
  fields: Field[],
  values: ResolvedValues,
  resume: LocalFile,
): Promise<void> {
  for (const field of fields) {
    try {
      if (field.type === "file") {
        if (field.id === "resume") {
          await page.locator('input[name="resume"]').setInputFiles(resume.path);
          // Lever shows a parsing indicator briefly; give it a moment.
          await humanPause(2000, 3500);
        }
        continue;
      }

      const value = values[field.id];
      if (value == null || value === "") continue;
      const selector = `[name="${field.id}"]`;

      switch (field.type) {
        case "select": {
          await page.locator(`select${selector}`).selectOption({ label: value });
          await humanPause();
          break;
        }
        case "multiselect": {
          for (const part of value.split(MULTI_SEP).map((p) => p.trim())) {
            await page.locator(`input[type="checkbox"]${selector}[value="${part}"]`).check();
            await humanPause(80, 200);
          }
          break;
        }
        case "radio": {
          await page.locator(`input[type="radio"]${selector}[value="${value}"]`).check();
          await humanPause();
          break;
        }
        case "textarea": {
          await typeInto(page.locator(`textarea${selector}`), value);
          break;
        }
        default: {
          await typeInto(page.locator(`input${selector}`), value);
        }
      }
    } catch (err) {
      // One uncooperative control must never cost the whole application:
      // the rest of the form still submits and the gap shows up in review.
      console.error(`[lever fill] ${field.id} (${field.label.slice(0, 50)}) failed: ${String(err).slice(0, 140)}`);
    }
  }
}

export async function submitLever(page: Page): Promise<SubmitResult> {
  const button = page.locator('#btn-submit, button[type="submit"]').first();
  await button.click();

  try {
    await Promise.race([
      page.waitForURL(/thanks/i, { timeout: 20_000 }),
      page.getByText(/application (has been )?submitted|thank you/i).first().waitFor({ timeout: 20_000 }),
    ]);
    return { outcome: "submitted" };
  } catch {
    const block = await detectCommonBlocks(page);
    if (block) return { outcome: "failed", reason: block === "captcha" ? "captcha" : "bot_wall" };
    const errorText = await page
      .locator('.application-error, [class*="error"]')
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
