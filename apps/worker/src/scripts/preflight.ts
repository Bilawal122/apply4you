import { createClient } from "@supabase/supabase-js";
import { Redis } from "ioredis";
import { WORKER_HEARTBEAT_KEY } from "@apply4you/shared";

/**
 * Deploy preflight for the worker host.
 *
 * The worker's failure mode is silence: it boots, or it doesn't, and the only
 * symptom either way is applications that never fill. This answers "will it
 * work here?" before anything is queued, and prints a Redis fingerprint so
 * the DEPLOYMENT.md trap — web and worker pointed at DIFFERENT Redis
 * instances, which looks exactly like a healthy system that processes
 * nothing — can be checked by eye against the Vercel value.
 *
 * Run on the host (e.g. `railway run pnpm --filter @apply4you/worker preflight`)
 * or locally with --env-file=../../.env. Read-only apart from one heartbeat
 * probe key it writes and deletes.
 */

let failed = 0;
function ok(label: string, detail = ""): void {
  console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label: string, detail: string): void {
  failed++;
  console.error(`  FAIL  ${label} — ${detail}`);
}

/** host:port only — never the password, so this is safe to paste into a chat. */
function redisFingerprint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "6379"}`;
  } catch {
    return "(unparseable REDIS_URL)";
  }
}

async function main(): Promise<void> {
  console.log("worker preflight\n");

  console.log("environment:");
  const redisUrl = process.env.REDIS_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  for (const [name, value] of [
    ["REDIS_URL", redisUrl],
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
    ["GEMINI_API_KEY", geminiKey],
  ] as const) {
    if (value) ok(name, name === "SUPABASE_URL" ? value : "set");
    else bad(name, "not set — the worker cannot run without it");
  }
  if (redisUrl && redisUrl.includes("railway.internal")) {
    bad(
      "REDIS_URL host",
      "points at railway.internal, which only resolves for services INSIDE the same Railway project — Vercel and local machines need the public proxy URL",
    );
  }
  // The anon key is a JWT with role=anon; using it here silently breaks every
  // write, because RLS then applies to the worker.
  if (serviceKey) {
    try {
      const role = JSON.parse(Buffer.from(serviceKey.split(".")[1] ?? "", "base64url").toString()).role;
      if (role && role !== "service_role") {
        bad("SUPABASE_SERVICE_ROLE_KEY", `this key's role is "${role}", not service_role`);
      } else if (role) {
        ok("SUPABASE_SERVICE_ROLE_KEY role", "service_role");
      }
    } catch {
      // Not a decodable JWT (could be a newer key format) — connectivity below
      // is the real test, so this is not a failure on its own.
    }
  }

  console.log("\nredis:");
  if (redisUrl) {
    console.log(`  instance: ${redisFingerprint(redisUrl)}  <- must MATCH the REDIS_URL set on Vercel`);
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      commandTimeout: 5_000,
      connectTimeout: 5_000,
      retryStrategy: (times: number) => (times > 2 ? null : 300),
      lazyConnect: true,
    });
    redis.on("error", () => undefined); // reported below; an unhandled 'error' would crash
    try {
      await redis.connect();
      const pong = await redis.ping();
      ok("PING", pong);

      const probe = `${WORKER_HEARTBEAT_KEY}:preflight`;
      await redis.set(probe, "1", "EX", 30);
      const readBack = await redis.get(probe);
      await redis.del(probe);
      if (readBack === "1") ok("write/read", "heartbeat key is writable");
      else bad("write/read", "value did not read back — the worker could not publish a heartbeat");

      // Anything already queued is work waiting for this process to exist.
      const waiting = await redis.llen("bull:resolve:wait").catch(() => 0);
      console.log(`  note: ${waiting} resolve job(s) already waiting in this instance`);

      const beat = await redis.get(WORKER_HEARTBEAT_KEY);
      console.log(
        beat
          ? `  note: another worker IS live against this Redis (${beat.slice(0, 120)})`
          : "  note: no live worker heartbeat on this Redis right now",
      );
    } catch (err) {
      bad("connect", err instanceof Error ? err.message : String(err));
    } finally {
      redis.disconnect();
    }
  }

  console.log("\nsupabase:");
  if (supabaseUrl && serviceKey) {
    try {
      const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { count, error } = await db
        .from("board_sources")
        .select("id", { count: "exact", head: true })
        .eq("active", true);
      if (error) bad("query board_sources", error.message);
      else ok("service-role query", `${count ?? 0} active board(s)`);

      const { count: pending, error: appErr } = await db
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft")
        .is("form_schema", null);
      if (!appErr) console.log(`  note: ${pending ?? 0} draft(s) waiting to be filled once this worker starts`);
    } catch (err) {
      bad("connect", err instanceof Error ? err.message : String(err));
    }
  }

  console.log("\nbrowser:");
  try {
    const { chromium } = await import("playwright");
    const path = chromium.executablePath();
    ok("chromium", path);
  } catch (err) {
    bad(
      "chromium",
      `${err instanceof Error ? err.message : String(err)} — submission needs it; run "npx playwright install --with-deps chromium"`,
    );
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} preflight check(s) FAILED — fix these before relying on this host.`);
    process.exit(1);
  }
  console.log("all preflight checks passed — this host can run the worker.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
