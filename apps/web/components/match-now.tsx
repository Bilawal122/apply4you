"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Drives the "matching in progress…" state to an actual conclusion.
 *
 * This used to be an AutoRefresh: poll the page every four seconds and wait for
 * the worker to write matches. When the worker was up that read as a progress
 * indicator. When it was not — a queue outage drops the enqueue best-effort —
 * it span forever against work that was never scheduled, and told the user
 * "this takes about a minute" every minute, indefinitely.
 *
 * So it asks for the work instead of waiting for it. One POST, which embeds the
 * profile and builds the match set in-request. If that fails, it says so and
 * offers a retry, because a stated failure a user can act on beats a spinner
 * that means nothing.
 */
export function MatchNow() {
  const router = useRouter();
  const [state, setState] = useState<"working" | "empty" | "error">("working");
  const [message, setMessage] = useState<string | null>(null);
  // React runs effects twice in dev StrictMode, and this one costs an embedding
  // call, so it is guarded rather than left to fire on every mount.
  const started = useRef(false);

  const run = useCallback(async () => {
    setState("working");
    setMessage(null);
    try {
      const res = await fetch("/api/profile/rematch", { method: "POST" });
      const body = (await res.json()) as { matches?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Matching failed.");
      if ((body.matches ?? 0) === 0) {
        setState("empty");
        return;
      }
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Matching failed.");
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (state === "working") {
    return (
      <>
        <p className="label-mono text-accent">matching in progress…</p>
        <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-[1.6] text-ink-body">
          Reading your profile against every open job. This takes a few seconds.
        </p>
      </>
    );
  }

  if (state === "empty") {
    return (
      <>
        <p className="text-[19px] font-bold tracking-[-0.02em] text-ink">No jobs matched your profile</p>
        <p className="mx-auto mt-2.5 max-w-md text-[14.5px] leading-[1.6] text-ink-body">
          Your profile was read successfully — nothing currently open scored highly enough against it.
          Widening your preferences (more titles, more locations) is usually what fixes this.
        </p>
        <button type="button" onClick={run} className="label-mono mt-4 text-accent underline underline-offset-4">
          try again
        </button>
      </>
    );
  }

  return (
    <>
      <p className="label-mono text-danger">matching failed</p>
      <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-[1.6] text-ink-body">{message}</p>
      <button type="button" onClick={run} className="label-mono mt-4 text-accent underline underline-offset-4">
        try again
      </button>
    </>
  );
}
