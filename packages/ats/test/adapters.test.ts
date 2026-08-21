import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerAllAdapters, getAdapter } from "../src/index.js";

const SRC = join(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return name.endsWith(".ts") ? [p] : [];
  });
}

/**
 * The UUID selector bug, made structural instead of conventional.
 *
 * Ashby field ids are UUIDs like `6f1b584f-ba7d-…`, and a CSS identifier may
 * not begin with a digit — so `#6f1b584f-…` is a SyntaxError. Because the
 * locator was a comma-separated list, the one invalid part invalidated the
 * whole selector, querySelectorAll threw, and the fill aborted. It cost two
 * real ElevenLabs submissions on 2026-08-03, and the production row is still
 * there: "locator.count: SyntaxError: … is not a valid selector".
 *
 * fill-helpers.ts documents the rule in a comment. Four separate files build
 * id selectors by hand, so a comment is not enough — this asserts it.
 */
describe("selector safety", () => {
  const files = sourceFiles(SRC);

  it("finds the adapter sources", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f.slice(SRC.length + 1), f]))(
    "%s never interpolates a field id into a #id selector",
    (_name, file) => {
      const src = readFileSync(file, "utf8");
      // `#${...}` inside any string or template literal.
      const offenders = [...src.matchAll(/#\$\{[^}]*\}/g)].map((m) => m[0]);
      expect(offenders, "use [id=\"${...}\"] — a CSS id may not start with a digit").toEqual([]);
    },
  );
});

describe("adapter registry", () => {
  registerAllAdapters();

  it.each(["greenhouse", "lever", "ashby", "workable"])("%s implements the full contract", (ats) => {
    const a = getAdapter(ats);
    expect(a.atsType).toBe(ats);
    for (const method of ["pollJobs", "readForm", "fillForm", "submit", "detectBlock"] as const) {
      expect(typeof a[method], `${ats}.${method}`).toBe("function");
    }
  });

  it("throws for an unknown ATS rather than returning undefined", () => {
    expect(() => getAdapter("linkedin")).toThrow();
  });
});
