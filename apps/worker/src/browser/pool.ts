import { chromium, type Browser, type BrowserContext } from "playwright";

let browser: Browser | null = null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      args: ["--disable-blink-features=AutomationControlled"],
    });
  }
  return browser;
}

/** One fresh context per submission: isolated cookies, realistic fingerprint. */
export async function withBrowserContext<T>(fn: (context: BrowserContext) => Promise<T>): Promise<T> {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 850 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  try {
    return await fn(context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function closeBrowser(): Promise<void> {
  await browser?.close().catch(() => undefined);
  browser = null;
}
