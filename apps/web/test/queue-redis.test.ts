import { describe, expect, it } from "vitest";
import { QUEUE_REDIS_OPTIONS } from "../lib/queue";

describe("queue Redis reconnect policy", () => {
  it("keeps the cached client reconnecting with capped backoff instead of ending it", () => {
    expect(QUEUE_REDIS_OPTIONS.retryStrategy).toBeTypeOf("function");
    expect([1, 2, 3, 10].map(QUEUE_REDIS_OPTIONS.retryStrategy)).toEqual([200, 400, 600, 1_000]);
  });

  it("bounds a failed request even while the connection keeps reconnecting", () => {
    expect(QUEUE_REDIS_OPTIONS.maxRetriesPerRequest).toBe(2);
    expect(QUEUE_REDIS_OPTIONS.commandTimeout).toBe(4_000);
    expect(QUEUE_REDIS_OPTIONS.connectTimeout).toBe(4_000);
  });
});
