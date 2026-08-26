import type { Page } from "playwright-core";
import type { Field, ResolvedValues, SubmitResult } from "@apply4you/shared";
import { JobRef, LocalFile, type FillFailure, type FillReport } from "../types.js";
import { detectCommonBlocks, humanPause, pickComboOption, typeInto } from "../fill-helpers.js";

const MULTI_SEP = "||";

/**
 * Workable sits behind Cloudflare — the highest-friction ATS of the four.
 * The apply page is a React SPA; controls carry data-ui attributes matching
 * the form API field ids. Expect a lower success rate; blocks are recorded,
 * never bypassed.
 */

export function workableFillUrl(job: JobRef): string {
  const base = job.applyUrl.replace(/\/$/, "");
  return base.endsWith("/apply") ? base : `${base}/apply/`;
}

function controlFor(page: Page, fieldId: string) {
  // Attribute selectors only — never `#id`. See cssEscape in ../fill-helpers.ts.
  return page.locator(`[data-ui="${fieldId}"], [id="${fieldId}"], [name="${fieldId}"]`).first();
}

export async function fillWorkableForm(
  page: Page,
  fields: Field[],
  values: ResolvedValues,
  resume: LocalFile,
): Promise<FillReport> {
  const failed: FillFailure[] = [];
  for (const field of fields) {
    try {
      if (field.type === "file") {
        if (field.id === "resume") {
          await page.locator('input[type="file"]').first().setInputFiles(resume.path);
          // Workable parses the resume client-side; wait for the spinner.
          await page
            .getByText(/uploading|parsing/i)
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
          // Boolean questions render as Yes/No radio-style buttons.
          const group = page.locator(`[data-ui="${field.id}"]`).first();
          const target = ((await group.count()) > 0 ? group : page).getByRole("radio", { name: value }).first();
          if ((await target.count()) > 0) {
            await target.check().catch(async () => target.click());
          } else {
            const btn = ((await group.count()) > 0 ? group : page).getByRole("button", { name: value, exact: true }).first();
            await btn.click();
          }
          await humanPause();
          break;
        }
        case "select":
        case "multiselect": {
          const parts = field.type === "multiselect" ? value.split(MULTI_SEP).map((p) => p.trim()) : [value];
          const combo = controlFor(page, field.id);
          for (const part of parts) {
            await pickComboOption(page, combo, part);
          }
          break;
        }
        case "textarea": {
          const control = controlFor(page, field.id);
          await typeInto(control, value, { reactSafe: true });
          break;
        }
        default: {
          const control = controlFor(page, field.id);
          if ((await control.count()) === 0) continue;
          await typeInto(control, value, { reactSafe: true });
        }
      }
    } catch (err) {
      // One uncooperative control must never cost the whole application:
      // the rest of the form still submits and the gap shows up in review.
      console.error(`[workable fill] ${field.id} (${field.label.slice(0, 50)}) failed: ${String(err).slice(0, 140)}`);
      failed.push({ id: field.id, label: field.label, reason: String(err).slice(0, 140) });
    }
  }
  return { failed };
}

export async function submitWorkable(page: Page): Promise<SubmitResult> {
  const button = page
    .locator('[data-ui="submit-application"]')
    .or(page.getByRole("button", { name: /submit application/i }))
    .first();
  await button.click();

  try {
    await page
      .getByText(/thank you|application (was |has been )?submitted|successfully applied/i)
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
