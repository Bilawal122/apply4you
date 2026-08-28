import { describe, expect, it } from "vitest";
import {
  LOCATION_BOOST,
  SPONSOR_BOOST,
  TITLE_BOOST,
  locationMatches,
  rankMatches,
  titleMatches,
} from "../src/matching.js";

describe("titleMatches", () => {
  it("matches when every token of a preference appears in the title", () => {
    expect(titleMatches(["software engineer"], "Senior Software Engineer, Platform")).toBe(true);
  });

  it("does not match on a single shared token", () => {
    expect(titleMatches(["software engineer"], "Sales Engineer")).toBe(false);
  });

  it("ignores short tokens so 'IT' does not match any word containing those letters", () => {
    // Every token is <= 2 chars, so there is nothing left to match on and the
    // preference must not match everything.
    expect(titleMatches(["IT"], "Legal Assistant")).toBe(false);
  });

  it("is case-insensitive and works for non-technical roles", () => {
    expect(titleMatches(["care assistant"], "Senior CARE Assistant (Nights)")).toBe(true);
    expect(titleMatches(["paralegal"], "Paralegal — Commercial Litigation")).toBe(true);
  });
});

describe("rankMatches", () => {
  const titles = ["Paralegal"];

  it("adds the title boost and re-orders on it", () => {
    const ranked = rankMatches(
      [
        { jobId: "other", score: 75, title: "Software Engineer" },
        { jobId: "para", score: 70, title: "Paralegal" },
      ],
      { titles },
    );
    expect(ranked[0]).toEqual({ jobId: "para", score: 70 + TITLE_BOOST });
    expect(ranked[1]!.jobId).toBe("other");
  });

  it("caps the final score at 100", () => {
    const ranked = rankMatches([{ jobId: "a", score: 99, title: "Paralegal" }], { titles });
    expect(ranked[0]!.score).toBe(100);
  });

  it("ignores sponsorship when the user has not said they need it", () => {
    const ranked = rankMatches(
      [
        { jobId: "unlicensed", score: 80, title: "Analyst" },
        { jobId: "licensed", score: 70, title: "Analyst", sponsorLicensed: true },
      ],
      { titles: [] },
    );
    expect(ranked[0]!.jobId).toBe("unlicensed");
  });

  it("lifts a licensed sponsor above a better-scoring unlicensed one when sponsorship is needed", () => {
    const ranked = rankMatches(
      [
        { jobId: "unlicensed", score: 80, title: "Analyst" },
        { jobId: "licensed", score: 70, title: "Analyst", sponsorLicensed: true },
      ],
      { titles: [], needsSponsorship: true },
    );
    // 70 + 15 = 85 > 80. A perfect-fit role at an employer that cannot legally
    // hire you is worth less than a decent one at an employer that can.
    expect(ranked[0]).toEqual({ jobId: "licensed", score: 70 + SPONSOR_BOOST });
  });

  it("treats a missing verdict as not licensed rather than as licensed", () => {
    // sponsor_verdict is null for any employer the register match did not
    // resolve, which must never be read as "this employer can sponsor".
    const ranked = rankMatches(
      [{ jobId: "unknown", score: 60, title: "Analyst" }],
      { titles: [], needsSponsorship: true },
    );
    expect(ranked[0]!.score).toBe(60);
  });

  it("stacks both boosts", () => {
    const ranked = rankMatches(
      [{ jobId: "a", score: 50, title: "Paralegal", sponsorLicensed: true }],
      { titles, needsSponsorship: true },
    );
    expect(ranked[0]!.score).toBe(50 + TITLE_BOOST + SPONSOR_BOOST);
  });
});

describe("locationMatches", () => {
  it("finds a short preference inside a long ATS string", () => {
    // The three spellings of London that actually appear in the index.
    expect(locationMatches(["London"], "London")).toBe(true);
    expect(locationMatches(["London"], "London, UK")).toBe(true);
    expect(locationMatches(["London"], "London, United Kingdom")).toBe(true);
  });

  it("is case-insensitive and ignores surrounding whitespace in the preference", () => {
    expect(locationMatches(["  manchester "], "Manchester, England")).toBe(true);
  });

  it("does not match a different place", () => {
    expect(locationMatches(["Manchester"], "San Francisco, CA")).toBe(false);
  });

  it("treats a missing job location as not a match", () => {
    // An unknown location is not evidence of the right one.
    expect(locationMatches(["London"], null)).toBe(false);
  });

  it("ignores empty preference entries rather than matching everything", () => {
    // "".includes() is true for every string, so a stray blank chip would
    // otherwise boost the entire index.
    expect(locationMatches([""], "San Francisco")).toBe(false);
    expect(locationMatches(["   "], "San Francisco")).toBe(false);
  });

  it("matches a bare Remote against Remote - US, which is why the form suggests Remote (UK)", () => {
    // Documenting a real limitation rather than pretending it away: 3,240 open
    // jobs say "Remote" and most are US-only, so a bare "Remote" preference is
    // a weak signal.
    expect(locationMatches(["Remote"], "Remote - US")).toBe(true);
    expect(locationMatches(["Remote (UK)"], "Remote - US")).toBe(false);
  });
});

describe("rankMatches — location", () => {
  it("lifts a location match above a better-scoring job elsewhere", () => {
    const ranked = rankMatches(
      [
        { jobId: "sf", score: 80, title: "Analyst", location: "San Francisco, CA" },
        { jobId: "mcr", score: 70, title: "Analyst", location: "Manchester, UK" },
      ],
      { titles: [], locations: ["Manchester"] },
    );
    expect(ranked[0]).toEqual({ jobId: "mcr", score: 70 + LOCATION_BOOST });
  });

  it("does nothing when the user has stated no locations", () => {
    const ranked = rankMatches(
      [
        { jobId: "sf", score: 80, title: "Analyst", location: "San Francisco, CA" },
        { jobId: "mcr", score: 70, title: "Analyst", location: "Manchester, UK" },
      ],
      { titles: [] },
    );
    expect(ranked[0]!.jobId).toBe("sf");
  });

  it("stacks with the title and sponsor boosts", () => {
    const ranked = rankMatches(
      [{ jobId: "a", score: 40, title: "Paralegal", location: "London, UK", sponsorLicensed: true }],
      { titles: ["Paralegal"], locations: ["London"], needsSponsorship: true },
    );
    expect(ranked[0]!.score).toBe(40 + TITLE_BOOST + SPONSOR_BOOST + LOCATION_BOOST);
  });
});
