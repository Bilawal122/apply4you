import { describe, expect, it } from "vitest";
import { isUkLocation } from "../src/uk.js";

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
