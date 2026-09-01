#!/usr/bin/env node
/**
 * Fails the build when robots.txt or sitemap.xml would tell a crawler to
 * visit a machine nobody else can reach.
 *
 * Production served this for real:
 *
 *   Sitemap: http://localhost:3000/sitemap.xml
 *   <loc>http://localhost:3000/</loc>
 *
 * Both endpoints returned 200, so every liveness check passed; only reading
 * the body showed the URLs were useless. APP_URL was absent from the Vercel
 * environment and the `?? "http://localhost:3000"` fallback written for
 * `next dev` quietly became the published answer.
 *
 * Next prerenders these routes at BUILD time, so the origin is baked into
 * the output and this can be checked without running the server. Run after
 * a build performed with a production-like origin in the environment.
 *
 * Because the origin is a build-time input, turbo.json lists APP_URL,
 * VERCEL_URL and VERCEL_PROJECT_PRODUCTION_URL under the build task's `env`.
 * Without that, turbo would replay a cached build whose SEO body names a
 * different host, and this guard would be checking a stale artifact.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "apps", "web", ".next", "server", "app");
const TARGETS = ["robots.txt.body", "sitemap.xml.body"];
const LOOPBACK = /(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?/i;

let failed = false;
const missing = [];

for (const name of TARGETS) {
  const path = join(OUT, name);
  if (!existsSync(path)) {
    missing.push(name);
    continue;
  }
  const body = readFileSync(path, "utf8");
  const hit = body.match(LOOPBACK);
  if (hit) {
    failed = true;
    console.error(`FAIL  ${name} points at "${hit[0]}" — crawlers cannot reach it.`);
    console.error(`      Set APP_URL (or deploy on Vercel, which supplies its own origin).`);
    console.error(`      Body was:\n${body.trim().split("\n").map((l) => `        ${l}`).join("\n")}`);
  } else {
    // Report a URL the file actually publishes. A plain "first absolute URL"
    // match reports the sitemap XML namespace (http://www.sitemaps.org/...),
    // which looks like a bare-http finding and reads as a failure.
    const shown =
      body.match(/<loc>([^<]+)<\/loc>/)?.[1] ??
      body.match(/^Sitemap:\s*(\S+)/m)?.[1] ??
      body.match(/https?:\/\/[^\s"<]+/)?.[0];
    console.log(`ok    ${name} -> ${shown ?? "(no absolute URL)"}`);
  }
}

if (missing.length === TARGETS.length) {
  console.error(
    `FAIL  no prerendered SEO output under ${OUT}. Run \`pnpm build\` first — ` +
      `if the routes stopped being statically generated, this guard is blind and must be rewritten.`,
  );
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`FAIL  missing prerendered output: ${missing.join(", ")}`);
  process.exit(1);
}

process.exit(failed ? 1 : 0);
