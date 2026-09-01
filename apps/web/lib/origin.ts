/**
 * The canonical public origin, for anything a crawler or an email recipient
 * will read back.
 *
 * This exists because the obvious version was wrong in production. robots.ts
 * and sitemap.ts each did `process.env.APP_URL ?? "http://localhost:3000"`,
 * APP_URL was never set in the Vercel production environment, and both
 * endpoints duly served
 *
 *   Sitemap: http://localhost:3000/sitemap.xml
 *   <loc>http://localhost:3000/</loc>
 *
 * to Google — a 200 response pointing at a machine nobody else can reach.
 * The fallback was written for `next dev` and silently became the production
 * answer.
 *
 * So the fallback chain never reaches localhost on a deployed build:
 *
 *  1. APP_URL — the explicit, deliberate answer, and the only one that can
 *     name a custom domain.
 *  2. Vercel's own origin. VERCEL_PROJECT_PRODUCTION_URL is the project's
 *     stable production hostname and is what a preview build should still
 *     point at; VERCEL_URL is the per-deployment hostname and is the last
 *     resort. Both are supplied automatically and arrive WITHOUT a scheme.
 *  3. localhost, only when nothing indicates a deployment.
 *
 * Not derived from the request Host header: this feeds sitemap/robots and
 * canonical URLs, and Host is attacker-controlled, so a poisoned value would
 * be served back to crawlers.
 */

const LOCAL_ORIGIN = "http://localhost:3000";

/** Strip any scheme and trailing slash, then re-apply https. */
function normalise(value: string): string {
  const bare = value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return bare ? `https://${bare}` : "";
}

/** Only the three variables this reads — narrower than ProcessEnv, and testable. */
export interface OriginEnv {
  APP_URL?: string | undefined;
  VERCEL_URL?: string | undefined;
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
}

export function resolveOrigin(env?: OriginEnv): string {
  // Named property reads rather than spreading process.env: Next replaces
  // these statically at build time, which is what bakes the right origin
  // into the prerendered robots.txt and sitemap.xml.
  const source: OriginEnv = env ?? {
    APP_URL: process.env.APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };

  const explicit = source.APP_URL?.trim();
  if (explicit) {
    // APP_URL is allowed to be http:// for local use; honour it verbatim
    // apart from a trailing slash, since it is the deliberate answer.
    return explicit.replace(/\/+$/, "");
  }

  // On Vercel these are always present, so a deployed build cannot fall
  // through to localhost even when APP_URL was forgotten.
  const vercel = source.VERCEL_PROJECT_PRODUCTION_URL || source.VERCEL_URL;
  if (vercel) return normalise(vercel);

  return LOCAL_ORIGIN;
}

/**
 * True when the resolved origin is not fit to publish. Used by the build-time
 * guard so a misconfigured deploy fails loudly instead of quietly telling
 * search engines to crawl localhost.
 */
export function isPublishableOrigin(origin: string): boolean {
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(origin);
}
