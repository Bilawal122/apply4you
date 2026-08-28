import { describe, expect, it } from "vitest";
import { decodeEntities, stripHtml, stripEscapedHtml } from "../src/html.js";

// Representative of what boards-api.greenhouse.io returns in `content`:
// the ENTIRE markup arrives entity-escaped, and text-level entities inside it
// are double-escaped (&amp;amp; → &amp; → &).
const GREENHOUSE_ESCAPED =
  "&lt;div class=&quot;content&quot;&gt;&lt;h2&gt;About us&lt;/h2&gt;" +
  "&lt;p&gt;We are hiring &amp;amp; growing.&lt;/p&gt;" +
  "&lt;ul&gt;&lt;li&gt;Ship things&lt;/li&gt;&lt;li&gt;Own outcomes&lt;/li&gt;&lt;/ul&gt;&lt;/div&gt;";

describe("stripEscapedHtml (Greenhouse content)", () => {
  it("produces readable plain text with no markup from escaped HTML", () => {
    const out = stripEscapedHtml(GREENHOUSE_ESCAPED);
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).toContain("About us");
    expect(out).toContain("We are hiring & growing.");
    expect(out).toContain("- Ship things");
    expect(out).toContain("- Own outcomes");
  });

  it("regression: stripHtml alone materialises raw tags from escaped input", () => {
    // Pins the original bug so nobody 'simplifies' greenhouse ingestion back
    // to stripHtml: strip-then-decode finds no literal tags to strip, and the
    // decode pass then creates them.
    expect(stripHtml(GREENHOUSE_ESCAPED)).toMatch(/<div class="content">/);
  });

  it("neutralises script-like content into inert text", () => {
    const out = stripEscapedHtml("&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;Real text&lt;/p&gt;");
    expect(out).not.toContain("<script>");
    expect(out).toContain("Real text");
  });
});

describe("stripHtml (literal HTML — Workable v2 path)", () => {
  it("strips tags and decodes text entities", () => {
    const out = stripHtml("<p>Pay: &pound;50k &amp; equity</p><ul><li>Remote</li></ul>".replace("&pound;", "&#163;"));
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).toContain("Pay: £50k & equity");
    expect(out).toContain("- Remote");
  });

  it("tolerates malformed / unclosed tags", () => {
    const out = stripHtml("<p>Intro <b>bold<i>nested</p><div >tail");
    expect(out).toContain("Intro bold");
    expect(out).toContain("nested");
    expect(out).toContain("tail");
    expect(out).not.toMatch(/<[a-z]/i);
  });
});

describe("decodeEntities hardening (ATS-6.1/6.2: one bad posting must not kill a board)", () => {
  it("decodes valid numeric and hex references", () => {
    expect(decodeEntities("&#163;50k &#x2013; caf&#233;")).toBe("£50k – café");
  });

  it("leaves out-of-range code points as literal text instead of throwing", () => {
    expect(() => decodeEntities("&#1114112;")).not.toThrow(); // 0x110000 > max
    expect(decodeEntities("&#1114112;")).toBe("&#1114112;");
  });

  it("leaves surrogate-half references as literal text", () => {
    expect(decodeEntities("&#xD800; and &#55296;")).toBe("&#xD800; and &#55296;");
  });

  it("refuses NUL and C0 controls but keeps newline and tab", () => {
    expect(decodeEntities("a&#0;b")).toBe("a&#0;b");
    expect(decodeEntities("a&#1;b")).toBe("a&#1;b");
    expect(decodeEntities("a&#10;b")).toBe("a\nb");
    expect(decodeEntities("a&#9;b")).toBe("a\tb");
  });
});
