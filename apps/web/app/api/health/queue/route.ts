import { NextResponse } from "next/server";
import { queueHealth } from "@/lib/queue";

/**
 * Operational health, readable without signing in.
 *
 * Deliberately unauthenticated: its whole purpose is to answer "is the
 * pipeline up?" from outside, at a moment when the answer is usually "no" and
 * the person asking may not be able to get far enough into the app to find
 * out. It exposes states, counts, and ages — never the Redis URL, host, or
 * credentials.
 *
 * A Redis PONG alone is NOT health (P1-04): the founding incident was ten
 * queued applications going nowhere while this endpoint said ok, because the
 * worker is a separate process that was not running. So this reports three
 * layers — Redis reachability, worker liveness (TTL'd heartbeat), and
 * per-queue depth with oldest-waiting age — and is only 200 when Redis
 * answers AND a worker has beaten within the staleness window. Point an
 * uptime pinger at it: "Redis up, worker dead" now goes red on its own.
 */
export const maxDuration = 15;
export const dynamic = "force-dynamic";

/**
 * `no-consumer` and `stale-worker-build` are both 503 on purpose: neither can
 * confirm a healthy consumer, and an endpoint that goes green on a guess is
 * the failure this route exists to prevent. They are separated because they
 * need opposite responses — one is "start the worker", the other is "the
 * worker is running an old build; redeploy it" — and because reporting the
 * second as the first already produced one wrong diagnosis: a re-audit read
 * `no-consumer` and concluded the queue-to-review path was unavailable while
 * the worker was in fact draining it, simply because that build predated the
 * heartbeat.
 */
function classify(health: Awaited<ReturnType<typeof queueHealth>>): {
  state: string;
  detail: string;
  ok: boolean;
} {
  if (!health.redis.ok) {
    return { state: "unreachable", detail: "Redis did not answer.", ok: false };
  }
  if (health.worker.alive) {
    return { state: "ok", detail: "Redis reachable and a worker heartbeat is fresh.", ok: true };
  }
  if (health.consumerObserved) {
    return {
      state: "stale-worker-build",
      detail:
        "Redis is reachable and jobs are ACTIVE, so a worker is consuming — but it publishes no heartbeat, " +
        "which means it is running a build older than heartbeat support. Redeploy the worker from current master.",
      ok: false,
    };
  }
  return {
    state: "no-consumer",
    detail:
      "Redis is reachable but no worker heartbeat and no active jobs — nothing is consuming the queues. " +
      "Start or redeploy the worker.",
    ok: false,
  };
}

export async function GET() {
  const health = await queueHealth();
  const { state, detail, ok } = classify(health);
  return NextResponse.json(
    {
      queue: state,
      detail,
      redis: {
        ok: health.redis.ok,
        detail: health.redis.detail,
        latencyMs: health.redis.latencyMs,
      },
      worker: {
        alive: health.worker.alive,
        lastSeen: health.worker.lastSeen,
        startedAt: health.worker.startedAt,
        version: health.worker.version,
      },
      // Positive evidence of a consumer, independent of the heartbeat: a job
      // is only `active` once a worker has claimed it.
      consumerObserved: health.consumerObserved,
      queues: health.queues,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
