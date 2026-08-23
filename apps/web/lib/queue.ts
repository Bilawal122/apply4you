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

/**
 * The PRODUCER connection. Its settings are deliberately the opposite of the
 * worker's, and getting that backwards took down profile saving in production.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ *workers*, which issue
 * blocking commands and must never have one time out. Copied onto a serverless
 * *producer* it means ioredis retries a command forever and never rejects it —
 * so when the cached global connection went stale between invocations and
 * Railway's public proxy reset it, `queue.add()` neither resolved nor threw.
 * The profile row was already written; the action simply never returned.
 * Vercel logged `POST /profile 0` after ~100 × `read ECONNRESET`, and the user
 * watched a button spin forever.
 *
 * The enqueue here is best-effort by design — the catch at every call site says
 * so — but it can only BE best-effort if a broken Redis fails fast instead of
 * hanging. Hence: bounded retries, bounded connect, bounded commands.
 */
function redis(): Redis {
  if (!globalThis.__queueRedis) {
    globalThis.__queueRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      // Fail the command rather than retrying it into the void.
      maxRetriesPerRequest: 2,
      // A command may never outlive the request that issued it.
      commandTimeout: 4_000,
      connectTimeout: 4_000,
      // Give up reconnecting quickly; a fresh invocation will make a new client.
      retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 200, 600)),
      // Keep the offline queue: on a cold start the first command legitimately
      // arrives before the socket is up, and commandTimeout still bounds it.
      enableOfflineQueue: true,
    });
    // Without a listener, a connection-level error is an unhandled 'error'
    // event on an EventEmitter, which crashes the function outright.
    globalThis.__queueRedis.on("error", (err: Error) => {
      console.warn(`[queue] redis error: ${err.message}`);
    });
  }
  return globalThis.__queueRedis;
}

/**
 * The outer guarantee: no enqueue may outlive the request that issued it.
 * Throws on timeout, so a caller that wants to tell the user can.
 */
async function bounded<T>(fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("enqueue timed out")), 5_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * For enqueues whose loss is recoverable: log and carry on.
 *
 * The silence is what kept this hidden — every call site caught and discarded
 * without a word, so a Redis that had been unreachable for an hour looked
 * exactly like a Redis that was fine.
 */
async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await bounded(fn);
  } catch (err) {
    console.warn(`[queue] ${label} not enqueued: ${err instanceof Error ? err.message : String(err)}`);
  }
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
  await bestEffort("embed-profile", () =>
    queue(QUEUES.profileEmbedding).add(
      "embed-profile",
      { userId },
      { jobId: `embed-profile-${userId}-${Date.now()}` },
    ),
  );
}

export async function enqueueResolve(applicationId: string): Promise<void> {
  // Resolution is safe to retry — it only reads the form and writes a draft.
  // Submission is NOT, and deliberately keeps BullMQ's single-attempt default:
  // a timed-out submit click may still have reached the employer.
  // Throws on failure, unlike the others: nothing re-enqueues a draft, so a
  // lost resolve leaves an application that looks queued forever. Both callers
  // already catch this and tell the user — they just never got the chance,
  // because the call used to hang instead of failing.
  await bounded(() =>
    queue(QUEUES.resolve).add(
      "resolve-application",
      { applicationId },
      { jobId: `resolve-${applicationId}`, attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
    ),
  );
}

export async function enqueueSubmit(atsType: string, applicationId: string): Promise<void> {
  // Recoverable: the worker re-enqueues every `approved` row on boot
  // (apps/worker/src/index.ts), so a lost enqueue costs a delay, not the
  // application. Never let it cost the user their approval click.
  await bestEffort("submit-application", () =>
    queue(submitQueueFor(atsType)).add("submit-application", { applicationId }, { jobId: `submit-${applicationId}` }),
  );
}
