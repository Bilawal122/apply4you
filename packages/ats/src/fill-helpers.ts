import type { Locator, Page } from "playwright-core";
import type { BlockKind } from "./types.js";

/**
 * Shared Playwright fill primitives. Playwright's fill() dispatches input and
 * change events natively (FR-25); React-controlled inputs that swallow fill()
 * get pressSequentially instead.
 */

/** CSS.escape for Node (Playwright locators evaluate selectors in the page). */
export function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/**
 * Resolve a form control by its ATS-native field id, id-first.
 *
 * Critical for multiselects: a Greenhouse multiselect's react-select input has
 * id="question_123[]" but the same page also has ~N hidden option inputs all
 * sharing name="question_123[]". A combined `#id, [name=...]` selector with
 * `.first()` can land on a hidden option input, so the menu never opens. The
 * id uniquely identifies the real control; only fall back to name/aria when no
 * element carries that id.
 */
export async function resolveControl(page: Page, fieldId: string): Promise<Locator> {
  // Attribute selector, not `#id` — Greenhouse multiselect ids contain "[]",
  // which is brittle to escape in a `#` selector but literal-safe here.
  const byId = page.locator(`[id="${fieldId}"]`).first();
  if ((await byId.count()) > 0) {
    // A single-select's id sits on the react-select input itself. A multiselect's
    // id sits on a <fieldset> wrapping the control — reach in for the clickable
    // react-select control when the id element contains one.
    const inner = byId.locator('.select__control, [role="combobox"]').first();
    if ((await inner.count()) > 0) return inner;
    return byId;
  }
  return page.locator(`[name="${fieldId}"], [aria-labelledby*="${fieldId}"]`).first();
}

export async function humanPause(min = 120, max = 400): Promise<void> {
  await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

export async function typeInto(locator: Locator, value: string, { reactSafe = false } = {}): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  if (reactSafe) {
    await locator.click();
    await locator.clear();
    await locator.pressSequentially(value, { delay: 15 + Math.random() * 30 });
  } else {
    await locator.fill(value);
  }
  await humanPause();
}

/**
 * Open a react-select-style menu. The clickable target that opens the menu is
 * sometimes the inner `input`, sometimes the `.select__control` wrapper around
 * it (multiselects especially). Click the input, then walk up its ancestors
 * until options actually render.
 */
async function openComboMenu(page: Page, control: Locator): Promise<boolean> {
  const alreadyOpen = await page.getByRole("option").first().isVisible().catch(() => false);
  if (alreadyOpen) return true;

  const targets: Locator[] = [
    control,
    control.locator("xpath=.."),
    control.locator("xpath=../.."),
    control.locator("xpath=../../.."),
  ];
  for (const target of targets) {
    if ((await target.count()) === 0) continue;
    await target.first().click({ timeout: 3000 }).catch(() => undefined);
    const appeared = await page
      .getByRole("option")
      .first()
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (appeared) return true;
  }
  return false;
}

/**
 * Custom combobox (react-select and friends): open, then pick the option whose
 * text matches (FR-26).
 *
 * Prefer clicking the exact option directly on the freshly-opened menu. Typing
 * to filter is a fallback for long/virtualized lists only — filtering makes
 * matching ambiguous (typing "US" also matches "A-us-tralia") and can detach
 * the option mid-click, which is the classic combobox-fill failure.
 */
export async function pickComboOption(page: Page, control: Locator, optionText: string): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await openComboMenu(page, control);
  await humanPause(150, 350);

  const clickExact = async (): Promise<boolean> => {
    const exact = page.getByRole("option", { name: optionText, exact: true }).first();
    if ((await exact.count()) > 0) {
      await exact.scrollIntoViewIfNeeded().catch(() => undefined);
      await exact.click({ timeout: 4000 });
      return true;
    }
    return false;
  };

  // 1. Exact option already rendered on the open menu.
  if (await clickExact()) {
    await humanPause();
    return;
  }

  // 2. Long list: type to filter, then click the exact match.
  try {
    await page.keyboard.type(optionText.slice(0, 24), { delay: 20 });
    await humanPause(250, 500);
  } catch {
    // non-typeable combobox
  }
  if (await clickExact()) {
    await humanPause();
    return;
  }

  // 3. Case-insensitive exact among whatever is rendered.
  const options = page.getByRole("option");
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = (await options.nth(i).innerText().catch(() => "")).trim();
    if (text.toLowerCase() === optionText.toLowerCase()) {
      await options.nth(i).click();
      await humanPause();
      return;
    }
  }

  throw new Error(`combo option not found: "${optionText}"`);
}

async function visible(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first();
  return (await el.count()) > 0 && (await el.isVisible().catch(() => false));
}

/**
 * CAPTCHA / bot-wall detection shared by all adapters. Never bypassed (FR-34).
 *
 * Critical distinction: reCAPTCHA v3 renders an invisible scoring badge
 * (`.grecaptcha-badge`, a ~256x60 anchor iframe) on nearly every Greenhouse
 * and Ashby form. That is ambient background scoring, NOT a challenge — it
 * does not block form fill or submission. Only an actual interactive challenge
 * blocks: a v2 "I'm not a robot" checkbox, the image-grid challenge popup, or
 * hCaptcha/Turnstile widgets.
 */
export async function detectCommonBlocks(page: Page): Promise<BlockKind> {
  // hCaptcha / Turnstile: any visible instance is an active challenge.
  if (
    (await visible(page, 'iframe[src*="hcaptcha"]')) ||
    (await visible(page, "#h-captcha")) ||
    (await visible(page, 'iframe[src*="turnstile"]')) ||
    (await visible(page, ".cf-turnstile"))
  ) {
    return "captcha";
  }

  // reCAPTCHA v2 checkbox (explicit, non-invisible widget).
  if (await visible(page, '.g-recaptcha[data-sitekey]:not([data-size="invisible"])')) {
    return "captcha";
  }

  // reCAPTCHA image-grid challenge popup (the "bframe"). The v3 anchor/badge
  // also matches src*="recaptcha", so exclude it by size — the badge is short,
  // a real challenge is a tall popup.
  const challenge = page.locator('iframe[src*="/recaptcha/"][src*="bframe"], iframe[title*="challenge" i]').first();
  if ((await challenge.count()) > 0 && (await challenge.isVisible().catch(() => false))) {
    const box = await challenge.boundingBox().catch(() => null);
    if (box && box.height > 120) return "captcha";
  }

  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  if (
    /just a moment|attention required|access denied|verify you are human/i.test(title) ||
    /verify you are human|checking your browser|enable javascript and cookies/i.test(bodyText.slice(0, 2000))
  ) {
    return "bot_wall";
  }
  return null;
}
