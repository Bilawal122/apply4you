import { Redis } from "ioredis";

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url, {
    // BullMQ requires this: it issues blocking commands with its own timeouts.
    maxRetriesPerRequest: null,
  });
}
