import { createRedisConnection } from "../redis.js";

/** Dev utility: verifies the REDIS_URL connection (TCP, as BullMQ uses it). */
async function main(): Promise<void> {
  const redis = createRedisConnection();
  const pong = await redis.ping();
  await redis.set("a4y:connectivity-check", new Date().toISOString(), "EX", 60);
  const value = await redis.get("a4y:connectivity-check");
  console.log(`ping=${pong} roundtrip=${value ? "ok" : "FAILED"}`);
  await redis.quit();
}

main().catch((err) => {
  console.error("Redis connection failed:", err.message);
  process.exit(1);
});
