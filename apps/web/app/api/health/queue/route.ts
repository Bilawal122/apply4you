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

export async function GET() {
  const health = await queueHealth();
  const ok = health.redis.ok && health.worker.alive;
  return NextResponse.json(
    {
      queue: ok ? "ok" : health.redis.ok ? "no-consumer" : "unreachable",
      redis: {
        ok: health.redis.ok,
        detail: health.redis.detail,
        latencyMs: health.redis.latencyMs,
      },
      worker: {
        alive: health.worker.alive,
        lastSeen: health.worker.lastSeen,
        startedAt: health.worker.startedAt,
      },
      queues: health.queues,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
