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
 * Custom combobox (react-select and friends): focus, type to filter, pick the
 * rendered option whose text matches (FR-26).
 */
export async function pickComboOption(page: Page, control: Locator, optionText: string): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await humanPause(150, 350);
  // Type a prefix to filter long lists; some comboboxes are click-only.
  try {
    await page.keyboard.type(optionText.slice(0, 24), { delay: 20 });
  } catch {
    // non-typeable combobox — options should be visible already
  }
  await humanPause(250, 600);
  const option = page
    .getByRole("option", { name: optionText, exact: true })
    .or(page.getByRole("option", { name: optionText }))
    .first();
  await option.click({ timeout: 5000 });
  await humanPause();
}

/** CAPTCHA / bot-wall detection shared by all adapters. Never bypassed (FR-34). */
export async function detectCommonBlocks(page: Page): Promise<BlockKind> {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    'iframe[title*="challenge"]',
    "#h-captcha",
    ".g-recaptcha[data-sitekey]",
  ];
  for (const selector of captchaSelectors) {
    const el = page.locator(selector).first();
    if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) return "captcha";
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
