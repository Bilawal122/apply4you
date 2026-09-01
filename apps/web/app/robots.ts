import type { MetadataRoute } from "next";
import { resolveOrigin } from "@/lib/origin";

// Never a bare localhost fallback here — see lib/origin.ts for why production
// was serving crawlers http://localhost:3000.
const base = resolveOrigin();

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
