import { afterEach, describe, expect, it } from "vitest";
import { logUsage, setUsageSink, withUsageUser, type UsageEvent } from "../src/client.js";

const captured: UsageEvent[] = [];
const sink = (e: UsageEvent) => void captured.push(e);
const USAGE = { promptTokenCount: 100, candidatesTokenCount: 50, cachedContentTokenCount: 0 };

afterEach(() => {
  captured.length = 0;
  setUsageSink(null);
});

/**
 * The regression net for 23,901 ai_usage rows written with user_id NULL. The
 * sink is registered once per runtime, so attribution can only come from the
 * async context the call is made inside.
 */
describe("AI usage attribution", () => {
  it("attaches the user of the surrounding context", async () => {
    setUsageSink(sink);
    await withUsageUser("user-a", async () => {
      logUsage("field-resolution", "gemini-2.5-flash-lite", USAGE);
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.userId).toBe("user-a");
  });

  it("leaves userId undefined outside any context — job embeds are not a user's cost", () => {
    setUsageSink(sink);
    logUsage("embed-job", "gemini-embedding-001", USAGE);
    expect(captured[0]!.userId).toBeUndefined();
  });

  it("propagates through awaits, not just the synchronous frame", async () => {
    setUsageSink(sink);
    await withUsageUser("user-b", async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      logUsage("cover-letter", "gemini-2.5-flash", USAGE);
    });
    expect(captured[0]!.userId).toBe("user-b");
  });

  it("does not bleed between concurrent users — the worker runs jobs in parallel", async () => {
    setUsageSink(sink);
    await Promise.all(
      ["u1", "u2", "u3", "u4"].map((u, i) =>
        withUsageUser(u, async () => {
          // Stagger so the interleaving is real, not incidental ordering.
          await new Promise((r) => setTimeout(r, (4 - i) * 6));
          logUsage("tailor-cv", "gemini-2.5-flash", USAGE);
        }),
      ),
    );
    expect(captured).toHaveLength(4);
    const byUser = Object.fromEntries(captured.map((e) => [e.userId, e.operation]));
    expect(Object.keys(byUser).sort()).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("nests: an inner context wins, and the outer one is restored", async () => {
    setUsageSink(sink);
    await withUsageUser("outer", async () => {
      await withUsageUser("inner", async () => logUsage("a", "gemini-2.5-flash", USAGE));
      logUsage("b", "gemini-2.5-flash", USAGE);
    });
    expect(captured.map((e) => [e.operation, e.userId])).toEqual([
      ["a", "inner"],
      ["b", "outer"],
    ]);
  });

  it("still records cost and tokens alongside the user", async () => {
    setUsageSink(sink);
    await withUsageUser("user-c", async () => logUsage("summary", "gemini-2.5-flash", USAGE));
    const e = captured[0]!;
    expect(e.inputTokens).toBe(100);
    expect(e.outputTokens).toBe(50);
    expect(e.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("a throwing sink never breaks the AI call", async () => {
    setUsageSink(() => {
      throw new Error("sink exploded");
    });
    await expect(
      withUsageUser("user-d", async () => {
        logUsage("field-resolution", "gemini-2.5-flash-lite", USAGE);
        return "call still returned";
      }),
    ).resolves.toBe("call still returned");
  });
});
