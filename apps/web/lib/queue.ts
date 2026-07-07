import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES } from "@apply4you/shared";

/**
 * Thin BullMQ producer — the web app only enqueues; all processing happens in
 * the worker service. Connections are cached per runtime instance.
 */

declare global {
  var __queueRedis: Redis | undefined;
  var __queues: Record<string, Queue> | undefined;
}

function redis(): Redis {
  if (!globalThis.__queueRedis) {
    globalThis.__queueRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return globalThis.__queueRedis;
}

function queue(name: string): Queue {
  globalThis.__queues ??= {};
  globalThis.__queues[name] ??= new Queue(name, { connection: redis() });
  return globalThis.__queues[name];
}

export async function enqueueProfileEmbedding(userId: string): Promise<void> {
  await queue(QUEUES.embedding).add("embed-profile", { userId }, { jobId: `embed-profile-${userId}-${Date.now()}` });
}

export async function enqueueResolve(applicationId: string): Promise<void> {
  await queue(QUEUES.resolve).add("resolve-application", { applicationId }, { jobId: `resolve-${applicationId}` });
}

export async function enqueueSubmit(atsType: string, applicationId: string): Promise<void> {
  await queue(`submit:${atsType}`).add("submit-application", { applicationId }, { jobId: `submit-${applicationId}` });
}
