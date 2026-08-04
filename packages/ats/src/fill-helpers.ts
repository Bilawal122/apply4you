import type { Locator, Page } from "playwright-core";
import type { BlockKind } from "./types.js";

/**
 * Shared Playwright fill primitives. Playwright's fill() dispatches input and
 * change events natively (FR-25); React-controlled inputs that swallow fill()
 * get pressSequentially instead.
 */

/**
 * NEVER build a `#id` selector from an ATS field id. Use `[id="..."]`.
 *
 * This burned two real submissions (2026-08-03, ElevenLabs via Ashby): Ashby
 * field ids are UUIDs like `6f1b584f-ba7d-...`, and a CSS identifier may not
 * begin with a digit. `#6f1b584f-...` is a SyntaxError, and because the
 * locator was a comma-separated list, the one invalid part invalidated the
 * whole selector — including the perfectly good `[id="..."]` sitting next to
 * it. querySelectorAll threw, the fill aborted, and the application was marked
 * failed. Escaping punctuation (what this helper did) does not help; a leading
 * digit needs `\3N ` escaping, which attribute selectors avoid entirely.
 *
 * Kept only for the rare case of escaping a value into a non-id selector.
 */
export function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/**
 * Per-field ceiling for "is this control actually here?" waits.
 *
 * Playwright's default is 30s. A form with a handful of controls that never
 * render (hidden behind a step, or simply absent from the DOM despite being in
 * the form schema) then spends minutes before failing — which is how a missing
 * Workable "summary" field timed out and, before the per-field guards, killed
 * an entire submission.
 */
export const CONTROL_TIMEOUT_MS = 6_000;

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
  await locator.scrollIntoViewIfNeeded({ timeout: CONTROL_TIMEOUT_MS });
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
  // Dismiss any menu a previous field left open (react-select multiselects stay
  // open after a selection). Without this, a page-global option match could
  // click a leftover option belonging to the previous control — a wrong answer.
  await page.keyboard.press("Escape").catch(() => undefined);
  await humanPause(60, 140);

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

async function anyVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const s of selectors) if (await visible(page, s)) return true;
  return false;
}

/** True once the widget has written a non-empty response token (solved / auto-passed). */
async function hasResponseToken(page: Page, tokenName: string): Promise<boolean> {
  const el = page.locator(`textarea[name="${tokenName}"], input[name="${tokenName}"]`).first();
  if ((await el.count()) === 0) return false;
  const value = await el.inputValue().catch(() => "");
  return value.length > 0;
}

/**
 * A visible challenge widget is a block only if it is UNSOLVED. Managed/
 * non-interactive Turnstile and hCaptcha render a visible widget that
 * auto-resolves for legitimate traffic — waiting for the response token
 * distinguishes "auto-passed" (token present) from "needs a human" (token
 * stays empty). Returns true only when the widget is present but unsolved.
 */
async function unsolvedChallenge(page: Page, widgetSelectors: string[], tokenName: string): Promise<boolean> {
  if (!(await anyVisible(page, widgetSelectors))) return false;
  for (let i = 0; i < 6; i++) {
    if (await hasResponseToken(page, tokenName)) return false; // auto-passed / already solved
    await page.waitForTimeout(500);
  }
  return true;
}

/**
 * reCAPTCHA v2 checkbox: a VISIBLE anchor iframe that is NOT inside the v3
 * `.grecaptcha-badge` (the invisible ambient-scoring badge). Both v2 and v3
 * anchors share title="reCAPTCHA" / api2/anchor, so the badge-ancestor test is
 * the discriminator — and it catches JS-rendered v2 widgets that carry no
 * `data-sitekey` attribute. Blocks only while unsolved.
 */
async function unsolvedRecaptchaV2(page: Page): Promise<boolean> {
  const anchors = page.locator('iframe[src*="/recaptcha/"][src*="anchor"], iframe[title="reCAPTCHA"]');
  const n = await anchors.count();
  let hasCheckbox = false;
  for (let i = 0; i < n; i++) {
    const a = anchors.nth(i);
    if (!(await a.isVisible().catch(() => false))) continue;
    const inBadge = await a
      .evaluate((el: { closest?: (s: string) => unknown }) => !!(el.closest && el.closest(".grecaptcha-badge")))
      .catch(() => false);
    if (!inBadge) {
      hasCheckbox = true;
      break;
    }
  }
  if (!hasCheckbox) return false;
  for (let i = 0; i < 6; i++) {
    if (await hasResponseToken(page, "g-recaptcha-response")) return false;
    await page.waitForTimeout(500);
  }
  return true;
}

/**
 * CAPTCHA / bot-wall detection shared by all adapters. Never bypassed (FR-34).
 *
 * A challenge counts as a block only when it is present AND unsolved (its
 * response token is empty). This correctly ignores reCAPTCHA v3's ambient
 * scoring badge and managed/non-interactive Turnstile/hCaptcha that auto-pass,
 * while still catching real interactive challenges — including JS-rendered v2
 * checkboxes that carry no `data-sitekey` attribute.
 */
export async function detectCommonBlocks(page: Page): Promise<BlockKind> {
  if (await unsolvedChallenge(page, ['iframe[src*="turnstile"]', ".cf-turnstile"], "cf-turnstile-response")) {
    return "captcha";
  }
  if (await unsolvedChallenge(page, ['iframe[src*="hcaptcha"]', "#h-captcha"], "h-captcha-response")) {
    return "captcha";
  }
  if (await unsolvedRecaptchaV2(page)) {
    return "captcha";
  }

  // reCAPTCHA image-grid challenge popup (the "bframe"): a tall visible popup,
  // distinct from the short v3 badge anchor.
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
