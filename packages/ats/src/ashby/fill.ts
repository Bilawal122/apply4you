import type { Page } from "playwright-core";
import type { Field, ResolvedValues, SubmitResult } from "@apply4you/shared";
import { LocalFile, type FillFailure, type FillReport } from "../types.js";
import { cssEscape, detectCommonBlocks, humanPause, pickComboOption, typeInto } from "../fill-helpers.js";

const MULTI_SEP = "||";

/**
 * Ashby is a React SPA: every input needs real keystrokes, and the resume
 * upload triggers a client-side parse that must finish before submitting.
 */

function controlFor(page: Page, fieldId: string) {
  return page.locator(`[id="${fieldId}"], [name="${fieldId}"]`).first();
}

async function labeledControl(page: Page, field: Field) {
  const byId = controlFor(page, field.id);
  if ((await byId.count()) > 0) return byId;
  // Fallback: locate by visible label text.
  return page.getByLabel(field.label, { exact: false }).first();
}

export async function fillAshbyForm(
  page: Page,
  fields: Field[],
  values: ResolvedValues,
  resume: LocalFile,
): Promise<FillReport> {
  const failed: FillFailure[] = [];
  for (const field of fields) {
    try {
      if (field.type === "file") {
        if (/resume/i.test(field.id) || /resume/i.test(field.label)) {
          await page.locator('input[type="file"]').first().setInputFiles(resume.path);
          // Wait out Ashby's resume-parse spinner; fields it autofills are
          // overwritten below because our loop continues after this.
          await page
            .getByText(/parsing|uploading/i)
            .first()
            .waitFor({ state: "hidden", timeout: 30_000 })
            .catch(() => undefined);
          await humanPause(1500, 2500);
        }
        continue;
      }

      const value = values[field.id];
      if (value == null || value === "") continue;

      switch (field.type) {
        case "radio": {
          // Ashby booleans render as Yes/No toggle buttons near the question.
          const container = page
            .locator(`[id="${field.id}"], [data-field-path="${field.id}"]`)
            .first()
            .or(page.getByText(field.label, { exact: false }).locator(".."));
          await container.getByRole("button", { name: value, exact: true }).first().click();
          await humanPause();
          break;
        }
        case "select":
        case "multiselect": {
          const parts = field.type === "multiselect" ? value.split(MULTI_SEP).map((p) => p.trim()) : [value];
          const combo = await labeledControl(page, field);
          for (const part of parts) {
            await pickComboOption(page, combo, part);
          }
          break;
        }
        default: {
          const control = await labeledControl(page, field);
          await typeInto(control, value, { reactSafe: true });
        }
      }
    } catch (err) {
      // One uncooperative control must never cost the whole application:
      // the rest of the form still submits and the gap shows up in review.
      console.error(`[ashby fill] ${field.id} (${field.label.slice(0, 50)}) failed: ${String(err).slice(0, 140)}`);
      failed.push({ id: field.id, label: field.label, reason: String(err).slice(0, 140) });
    }
  }
  return { failed };
}

export async function submitAshby(page: Page): Promise<SubmitResult> {
  const button = page.getByRole("button", { name: /submit application/i }).first();
  await button.click();

  try {
    await page
      .getByText(/application (was |has been )?submitted|thank you for applying|success/i)
      .first()
      .waitFor({ timeout: 25_000 });
    return { outcome: "submitted" };
  } catch {
    const block = await detectCommonBlocks(page);
    if (block) return { outcome: "failed", reason: block === "captcha" ? "captcha" : "bot_wall" };
    const errorText = await page
      .locator('[class*="error" i], [role="alert"]')
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
