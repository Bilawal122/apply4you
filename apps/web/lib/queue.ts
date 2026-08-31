import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  QUEUES,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_STALE_MS,
  submitQueueFor,
} from "@apply4you/shared";

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
async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await bounded(fn);
    return true;
  } catch (err) {
    console.warn(`[queue] ${label} not enqueued: ${err instanceof Error ? err.message : String(err)}`);
    return false;
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

export async function enqueueProfileEmbedding(userId: string): Promise<boolean> {
  return bestEffort("embed-profile", () =>
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

export async function enqueueSubmit(atsType: string, applicationId: string): Promise<boolean> {
  // Recoverable, so it never costs the user their approval click: the worker
  // re-enqueues every `approved` row on boot (apps/worker/src/index.ts).
  //
  // But it returns whether it landed, because "recoverable" is not the same as
  // "happened". Recovery needs a worker that can boot, and the worker boots by
  // pinging the same Redis this just failed against — so when this returns
  // false, the honest thing to tell the user is that it is waiting, not that it
  // is on its way.
  return bestEffort("submit-application", () =>
    queue(submitQueueFor(atsType)).add("submit-application", { applicationId }, { jobId: `submit-${applicationId}` }),
  );
}

/**
 * Is the queue actually reachable?
 *
 * Every producer here is deliberately forgiving — a queue that is down must not
 * cost someone their save or their approval — which means an outage is quiet by
 * construction. The only way to observe one was to read Vercel's runtime logs
 * after a signed-in user happened to touch a Redis path, which is a terrible
 * way to answer "is it up?" and cost real hours during the outage this was
 * written in.
 *
 * Uses the same cached connection the producers use, so the answer reflects
 * what the app actually experiences rather than what a fresh socket would.
 * Never throws, and never reveals the URL or credentials — the caller gets a
 * state and, at most, an error code.
 */
export async function pingQueue(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const started = Date.now();
  try {
    const pong = await bounded(() => redis().ping());
    return { ok: pong === "PONG", detail: pong, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: message.slice(0, 120), latencyMs: Date.now() - started };
  }
}

export interface WorkerHeartbeat {
  alive: boolean;
  lastSeen: string | null;
  startedAt: string | null;
}

/**
 * Is anything actually CONSUMING the queues? A Redis PONG only proves Redis
 * is up — the incident that motivated all of this was ten applications
 * sitting in "still filling out" while the health endpoint said ok. The
 * worker refreshes a TTL'd heartbeat key; no key (or a stale one) means no
 * consumer. Never throws: an unreadable heartbeat is reported as "not alive",
 * which is the safe direction for every caller.
 */
export async function workerHeartbeat(): Promise<WorkerHeartbeat> {
  try {
    const raw = await bounded(() => redis().get(WORKER_HEARTBEAT_KEY));
    if (!raw) return { alive: false, lastSeen: null, startedAt: null };
    const beat = JSON.parse(raw) as { at?: string; startedAt?: string };
    const at = typeof beat.at === "string" ? beat.at : null;
    const age = at ? Date.now() - new Date(at).getTime() : Number.POSITIVE_INFINITY;
    return {
      alive: Number.isFinite(age) && age < WORKER_HEARTBEAT_STALE_MS,
      lastSeen: at,
      startedAt: typeof beat.startedAt === "string" ? beat.startedAt : null,
    };
  } catch {
    return { alive: false, lastSeen: null, startedAt: null };
  }
}

export interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  /** Age of the oldest job seen in the waiting page, or null when empty. */
  oldestWaitingMs: number | null;
}

export interface QueueHealth {
  redis: { ok: boolean; detail: string; latencyMs: number };
  worker: WorkerHeartbeat;
  queues: Record<string, QueueCounts | null>;
}

/** The queues a stuck user actually cares about. */
const HEALTH_QUEUES = [
  QUEUES.resolve,
  QUEUES.submitGreenhouse,
  QUEUES.submitLever,
  QUEUES.submitAshby,
  QUEUES.submitWorkable,
] as const;

/** Full operational picture: Redis, consumer liveness, depth and backlog age. */
export async function queueHealth(): Promise<QueueHealth> {
  const redisPing = await pingQueue();
  if (!redisPing.ok) {
    return { redis: redisPing, worker: { alive: false, lastSeen: null, startedAt: null }, queues: {} };
  }

  const worker = await workerHeartbeat();
  // Parallel, not sequential: each queue's reads are individually bounded at
  // 5s, and a degraded Redis timing out per call made the sequential sum
  // (5 queues × up to 2 calls) blow past the route's maxDuration of 15s —
  // the platform then kills the handler mid-flight instead of returning the
  // partial truth. In parallel the worst case is one bound, not their sum.
  const perQueue = await Promise.all(
    HEALTH_QUEUES.map(async (name): Promise<[string, QueueCounts | null]> => {
      try {
        const q = queue(name);
        const jobCounts = await bounded(() => q.getJobCounts("waiting", "active", "failed", "delayed"));
        let oldestWaitingMs: number | null = null;
        if ((jobCounts.waiting ?? 0) > 0) {
          // A page, not the head: cheap insurance against list-order assumptions.
          const waiting = await bounded(() => q.getWaiting(0, 49));
          const oldest = Math.min(...waiting.map((j) => j.timestamp ?? Number.POSITIVE_INFINITY));
          if (Number.isFinite(oldest)) oldestWaitingMs = Date.now() - oldest;
        }
        return [
          name,
          {
            waiting: jobCounts.waiting ?? 0,
            active: jobCounts.active ?? 0,
            failed: jobCounts.failed ?? 0,
            delayed: jobCounts.delayed ?? 0,
            oldestWaitingMs,
          },
        ];
      } catch {
        return [name, null]; // this queue's stats were unreadable; say so, don't guess
      }
    }),
  );
  return { redis: redisPing, worker, queues: Object.fromEntries(perQueue) };
}
