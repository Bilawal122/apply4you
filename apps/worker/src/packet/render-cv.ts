import { renderCvHtml, type Profile, type ResolvedCv } from "@apply4you/shared";
import { withBrowserContext } from "../browser/pool.js";

/**
 * PDF half of the tailored CV (task #40).
 *
 * The markup itself lives in @apply4you/shared so the web app can serve the
 * exact same document as the user's pre-approval preview — the preview must BE
 * the artifact, not a lookalike that can drift from what gets sent. Only the
 * Playwright rasterisation stays here, since Vercel can't run a browser.
 */
export async function renderCvPdf(profile: Profile, cv: ResolvedCv): Promise<Buffer> {
  return withBrowserContext(async (context) => {
    const page = await context.newPage();
    await page.setContent(renderCvHtml(profile, cv), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    await page.close();
    return pdf;
  });
}

export { renderCvHtml };
