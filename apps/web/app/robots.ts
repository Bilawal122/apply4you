import type { MetadataRoute } from "next";

// APP_URL is the canonical origin (set on Vercel per DEPLOYMENT.md); the
// fallback keeps the file valid in local dev where it may be unset.
const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/feed",
        "/dashboard",
        "/applications",
        "/profile",
        "/preferences",
        "/onboarding",
        "/auth/",
        "/update-password",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
