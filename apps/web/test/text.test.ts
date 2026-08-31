import { describe, expect, it } from "vitest";
import { descriptionExcerpt, plainDescription } from "../lib/text";

describe("render-time entity decoding never throws (regression)", () => {
  // Ingestion (packages/ats safeFromCodePoint) deliberately preserves invalid
  // numeric references as literal text in stored descriptions — so the web
  // decoders WILL meet them, inside the /feed and /jobs/[id] server renders,
  // where a RangeError is a 500 for the whole page.
  const nasty =
    "<p>Great role&#1114112; with &#x110000; and &#xD800; perks&#0;</p>" +
    "<ul><li>Ship &amp; learn</li></ul>" +
    "Enough text to clear the excerpt's forty-character substance guard easily.";

  it("plainDescription tolerates out-of-range, surrogate, and NUL references", () => {
    expect(() => plainDescription(nasty)).not.toThrow();
    const out = plainDescription(nasty);
    expect(out).toContain("Great role");
    expect(out).toContain("Ship & learn");
    expect(out).not.toMatch(/<[^>]+>/);
  });

  it("descriptionExcerpt tolerates them too", () => {
    expect(() => descriptionExcerpt(nasty)).not.toThrow();
    expect(descriptionExcerpt(nasty)).toContain("Great role");
  });

  it("still decodes valid references, and folds CR into the newline", () => {
    expect(plainDescription("Pay: &#163;50k")).toBe("Pay: £50k");
    expect(plainDescription("Line1&#13;&#10;Line2")).not.toContain("&#13;");
  });
});
