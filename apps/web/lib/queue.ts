import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES, submitQueueFor } from "@apply4you/shared";

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
  // Drop completed/failed job records so a re-enqueue with the same deterministic
  // jobId (e.g. re-resolving a reset draft, or re-approving after a failed submit)
  // is not silently deduped against a lingering record. Concurrent double-adds are
  // still deduped while a job is waiting/active; job history lives in Postgres.
  globalThis.__queues[name] ??= new Queue(name, {
    connection: redis(),
    defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
  });
  return globalThis.__queues[name];
}

export async function enqueueProfileEmbedding(userId: string): Promise<void> {
  await queue(QUEUES.profileEmbedding).add(
    "embed-profile",
    { userId },
    { jobId: `embed-profile-${userId}-${Date.now()}` },
  );
}

export async function enqueueResolve(applicationId: string): Promise<void> {
  // Resolution is safe to retry — it only reads the form and writes a draft.
  // Submission is NOT, and deliberately keeps BullMQ's single-attempt default:
  // a timed-out submit click may still have reached the employer.
  await queue(QUEUES.resolve).add(
    "resolve-application",
    { applicationId },
    { jobId: `resolve-${applicationId}`, attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
  );
}

export async function enqueueSubmit(atsType: string, applicationId: string): Promise<void> {
  await queue(submitQueueFor(atsType)).add("submit-application", { applicationId }, { jobId: `submit-${applicationId}` });
}
