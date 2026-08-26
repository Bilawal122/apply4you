import { NextResponse } from "next/server";
import { pingQueue } from "@/lib/queue";

/**
 * Queue liveness, readable without signing in.
 *
 * Deliberately unauthenticated: its whole purpose is to answer "is the queue
 * up?" from outside, at a moment when the answer is usually "no" and the person
 * asking may not be able to get far enough into the app to find out. It exposes
 * one bit plus an error code — never the Redis URL, host, or credentials — so
 * there is nothing here an attacker could not learn by watching the product
 * fail anyway.
 *
 * 200 when reachable, 503 when not, so uptime checks and `curl -f` both work.
 */
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await pingQueue();
  return NextResponse.json(
    {
      queue: result.ok ? "ok" : "unreachable",
      detail: result.detail,
      latencyMs: result.latencyMs,
      checkedAt: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 503 },
  );
}
