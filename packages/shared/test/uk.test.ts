import { describe, expect, it } from "vitest";
import { byUkFirst, isUkLocation, ukSponsorRelevant } from "../src/uk.js";

describe("isUkLocation", () => {
  it("accepts explicit country markers in the shapes the ATSs actually write", () => {
    for (const s of [
      "London, UK",
      "London, United Kingdom",
      "Manchester, England",
      "Edinburgh, Scotland",
      "Cardiff, Wales",
      "Belfast, Northern Ireland",
      "Remote (UK)",
      "Bristol, U.K.",
    ]) {
      expect(isUkLocation(s), s).toBe(true);
    }
  });

  it("accepts unambiguous UK cities with no country given", () => {
    expect(isUkLocation("London")).toBe(true);
    expect(isUkLocation("Leeds")).toBe(true);
    expect(isUkLocation("Glasgow")).toBe(true);
  });

  it("does not treat Ukraine as the UK", () => {
    // The bug this file exists to prevent: `location.includes("uk")`.
    expect(isUkLocation("Kyiv, Ukraine")).toBe(false);
    expect(isUkLocation("Ukraine")).toBe(false);
  });

  it("does not match uk inside an unrelated word", () => {
    expect(isUkLocation("Milwaukee, WI")).toBe(false);
    expect(isUkLocation("Paducah")).toBe(false);
  });

  it("rejects the US twins of UK city names", () => {
    // Each of these is a real, sizeable job market that is not British.
    expect(isUkLocation("Manchester, NH")).toBe(false);
    expect(isUkLocation("Birmingham, AL")).toBe(false);
    expect(isUkLocation("Cambridge, MA")).toBe(false);
    expect(isUkLocation("Reading, PA")).toBe(false);
    expect(isUkLocation("Newcastle, WA")).toBe(false);
  });

  it("still accepts a US-twin city when the string says United Kingdom", () => {
    // The country marker is checked first and wins outright.
    expect(isUkLocation("Cambridge, United Kingdom")).toBe(true);
    expect(isUkLocation("Birmingham, UK")).toBe(true);
  });

  it("rejects other countries, including the Republic of Ireland", () => {
    for (const s of ["Dublin, Ireland", "San Francisco, CA", "Bengaluru, India", "Sydney, Australia", "Toronto, Canada"]) {
      expect(isUkLocation(s), s).toBe(false);
    }
  });

  it("treats an absent location as not UK rather than throwing", () => {
    expect(isUkLocation(null)).toBe(false);
    expect(isUkLocation(undefined)).toBe(false);
    expect(isUkLocation("")).toBe(false);
  });

  it("does not claim a bare Remote is British", () => {
    expect(isUkLocation("Remote")).toBe(false);
    expect(isUkLocation("Remote - US")).toBe(false);
  });
});

describe("byUkFirst", () => {
  const locOf = (j: { location: string | null }) => j.location;

  it("puts UK jobs ahead of non-UK ones", () => {
    const jobs = [
      { location: "San Francisco, CA" },
      { location: "London, UK" },
      { location: "Austin, TX" },
      { location: "Manchester" },
    ];
    const sorted = [...jobs].sort(byUkFirst(locOf));
    expect(sorted.slice(0, 2).map(locOf).sort()).toEqual(["London, UK", "Manchester"]);
  });

  it("treats a missing location as non-UK, not as a tie-breaker crash", () => {
    const jobs = [{ location: null }, { location: "Leeds" }, { location: null }];
    expect(jobs.sort(byUkFirst(locOf))[0].location).toBe("Leeds");
  });

  it("is a no-op when nothing is UK", () => {
    const jobs = [{ location: "Berlin" }, { location: "Paris" }];
    expect([...jobs].sort(byUkFirst(locOf))).toEqual(jobs);
  });
});

describe("ukSponsorRelevant", () => {
  it("is relevant for UK locations", () => {
    for (const s of ["London, UK", "Manchester, United Kingdom", "Leeds", "Edinburgh, Scotland"]) {
      expect(ukSponsorRelevant(s), s).toBe(true);
    }
  });

  it("is relevant when the location is unknown — absence is not evidence", () => {
    expect(ukSponsorRelevant(null)).toBe(true);
    expect(ukSponsorRelevant(undefined)).toBe(true);
    expect(ukSponsorRelevant("   ")).toBe(true);
  });

  it("stays relevant for working-mode strings with no placing marker", () => {
    for (const s of ["Remote", "Hybrid", "Remote — EMEA", "Flexible / Remote", "Remote, Europe"]) {
      expect(ukSponsorRelevant(s), s).toBe(true);
    }
  });

  it("is NOT relevant for the exact shapes the audit caught: non-UK roles at licensed employers", () => {
    for (const s of ["Warsaw, Poland", "Madrid, Spain", "Poland", "Barcelona", "Kraków, Poland".normalize()]) {
      expect(ukSponsorRelevant(s), s).toBe(false);
    }
  });

  it("is NOT relevant for a remote role explicitly placed elsewhere", () => {
    for (const s of ["Remote - US", "Remote — Poland", "Remote (Germany)", "Remote, Canada"]) {
      expect(ukSponsorRelevant(s), s).toBe(false);
    }
  });

  it("is NOT relevant for concrete places it cannot recognise as UK (cautious direction)", () => {
    for (const s of ["Paris", "Berlin", "New York, NY", "Tokyo", "Springfield"]) {
      expect(ukSponsorRelevant(s), s).toBe(false);
    }
  });
});
