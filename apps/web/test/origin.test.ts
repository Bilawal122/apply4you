import { describe, expect, it } from "vitest";
import { isPublishableOrigin, resolveOrigin } from "../lib/origin";

describe("resolveOrigin (P1-01 regression)", () => {
  it("prefers an explicit APP_URL and strips trailing slashes", () => {
    expect(resolveOrigin({ APP_URL: "https://apply4you.app/" })).toBe("https://apply4you.app");
    expect(resolveOrigin({ APP_URL: "https://apply4you.app" })).toBe("https://apply4you.app");
  });

  it("honours an http APP_URL verbatim — it is the deliberate answer", () => {
    // Local development explicitly sets this; we must not force https onto it.
    expect(resolveOrigin({ APP_URL: "http://localhost:3001" })).toBe("http://localhost:3001");
  });

  it("NEVER falls back to localhost on Vercel when APP_URL was forgotten", () => {
    // The exact production failure: APP_URL unset, so live robots.txt and
    // sitemap.xml told crawlers to visit http://localhost:3000.
    const onVercel = { VERCEL_PROJECT_PRODUCTION_URL: "apply4you.vercel.app" };
    expect(resolveOrigin(onVercel)).toBe("https://apply4you.vercel.app");
    expect(isPublishableOrigin(resolveOrigin(onVercel))).toBe(true);
  });

  it("falls back to the per-deployment host when the project host is absent", () => {
    expect(resolveOrigin({ VERCEL_URL: "apply4you-abc123.vercel.app" })).toBe(
      "https://apply4you-abc123.vercel.app",
    );
  });

  it("prefers the stable production host over the per-deployment one", () => {
    expect(
      resolveOrigin({
        VERCEL_PROJECT_PRODUCTION_URL: "apply4you.vercel.app",
        VERCEL_URL: "apply4you-abc123.vercel.app",
      }),
    ).toBe("https://apply4you.vercel.app");
  });

  it("adds the scheme Vercel omits, and tolerates one already present", () => {
    expect(resolveOrigin({ VERCEL_URL: "https://x.vercel.app/" })).toBe("https://x.vercel.app");
  });

  it("only reaches localhost when nothing indicates a deployment", () => {
    expect(resolveOrigin({})).toBe("http://localhost:3000");
  });

  it("ignores an empty or whitespace APP_URL rather than emitting a bare slash", () => {
    expect(resolveOrigin({ APP_URL: "   ", VERCEL_URL: "x.vercel.app" })).toBe("https://x.vercel.app");
  });
});

describe("isPublishableOrigin", () => {
  it("rejects every loopback form — these must never reach a crawler", () => {
    for (const bad of [
      "http://localhost:3000",
      "http://localhost",
      "https://127.0.0.1:3000",
      "http://[::1]:3000",
    ]) {
      expect(isPublishableOrigin(bad), bad).toBe(false);
    }
  });

  it("accepts real public origins", () => {
    for (const good of ["https://apply4you.vercel.app", "https://apply4you.app"]) {
      expect(isPublishableOrigin(good), good).toBe(true);
    }
  });

  it("does not reject a hostname that merely contains the word localhost", () => {
    expect(isPublishableOrigin("https://localhost-tools.example.com")).toBe(true);
  });
});
