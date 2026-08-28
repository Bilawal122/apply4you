"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getMatchingStatus, queueTopMatches } from "@/app/(app)/actions";
import { Spinner, btnLink, btnPrimary, cardCls, cardDarkCls } from "@/components/ui";

const POLL_MS = 2500;
const STALL_AFTER_MS = 75_000;
const AUTO_QUEUE_MAX = 10;

type Phase = "searching" | "queuing" | "done" | "stalled";

/** The eyebrow, spelled out rather than borrowed from `.label-mono`, because
 *  that class carries its own (light-surface) colour and cannot be re-inked. */
const darkEyebrow = "font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-on-slate-faint";

/**
 * Onboarding step 4. Asks for a match run, polls until it lands, then queues the
 * top matches as review-gated drafts — the "we started applying for you" moment.
 * Nothing is ever submitted without the user's approval.
 *
 * It asks rather than only polling because the queue path is best-effort: when
 * Redis is unreachable the enqueue is dropped, and a poll loop then waits out
 * its full stall timeout against work nobody scheduled. `/api/profile/rematch`
 * does the same embed-and-match in-request, so this step completes with or
 * without a worker.
 */
export function OnboardingMatches() {
  const [phase, setPhase] = useState<Phase>("searching");
  const [embedded, setEmbedded] = useState(false);
  const [matches, setMatches] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  // Whether a worker was actually consuming when the queue action ran — the
  // "filling right now" copy must not be shown when nothing is (P0-01).
  const [filling, setFilling] = useState(true);
  // True when we found applications already in flight instead of queuing new
  // ones (re-onboarding, or the user queued from the feed mid-wizard).
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const queueStarted = useRef(false);
  // Stamped in the effect below, never during render — `Date.now()` is impure
  // and a render-time read would drift on every incidental re-render.
  const startedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Start (or restart, when `runId` bumps) the stall clock for this run.
    startedAt.current = Date.now();

    // Fire-and-forget: the poll below is what reads the result, and it must keep
    // running even if this request fails, because the worker may be doing the
    // same job in parallel and get there first.
    void fetch("/api/profile/rematch", { method: "POST" }).catch(() => undefined);

    async function tick() {
      if (cancelled) return;

      let status: { embedded: boolean; matches: number; activeApps: number } | null = null;
      try {
        status = await getMatchingStatus();
      } catch {
        status = null; // transient transport failure — fall through to the stall check
      }
      if (cancelled) return;

      if (status) {
        setEmbedded(status.embedded);
        setMatches(status.matches);

        if (status.matches > 0 && !queueStarted.current) {
          queueStarted.current = true;

          if (status.activeApps > 0) {
            // Something is already in the review pipeline — don't pile on.
            setQueuedCount(status.activeApps);
            setAlreadyActive(true);
            setPhase("done");
            return;
          }

          setPhase("queuing");
          try {
            const res = await queueTopMatches(Math.min(AUTO_QUEUE_MAX, status.matches));
            if (cancelled) return;
            // Shown even when some queued: a partial result means part of the
            // batch is not being worked on, which the user cannot see from the
            // count alone.
            if (res.error) setError(res.error);
            setQueuedCount(res.queued ?? 0);
            setFilling(res.filling !== false);
            setPhase("done");
          } catch {
            if (cancelled) return;
            // The action may or may not have landed server-side — let a retry
            // re-check instead of wedging in "queuing" forever.
            queueStarted.current = false;
            setError("Queuing hiccupped — your matches are safe. Retry, or queue from your feed.");
            setPhase("stalled");
          }
          return;
        }
      }

      // Stall check runs whether or not the poll itself succeeded.
      if (Date.now() - startedAt.current > STALL_AFTER_MS) {
        setPhase("stalled");
        return;
      }
      if (!cancelled) setTimeout(tick, POLL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const retry = () => {
    setError(null);
    startedAt.current = Date.now();
    queueStarted.current = false;
    setPhase("searching");
    // Bumping runId re-runs the effect, which issues the rematch request itself.
    setRunId((r) => r + 1);
  };

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4">
        {/* The count is the headline, so it gets the dark panel and the lime. */}
        <div className={`${cardDarkCls} px-6 py-7 sm:px-7`}>
          <p className={darkEyebrow}>Matched</p>
          <p className="mt-3 font-mono text-[44px] leading-none tabular-nums text-lime">{matches}</p>
          <p className="mt-2 text-[14px] leading-[1.5] text-on-slate-mute">jobs match your criteria</p>
          {queuedCount > 0 && (
            <div className="mt-6 border-t border-slate-hair pt-2">
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-[14px] text-on-slate-soft">
                  {alreadyActive ? "already in your review queue" : "queued for review"}
                </span>
                <span className="font-mono text-[15px] tabular-nums text-on-slate">{queuedCount}</span>
              </div>
            </div>
          )}
        </div>

        <div className={`${cardCls} px-6 py-6 sm:px-7`}>
          {alreadyActive ? (
            <p className="text-[14.5px] leading-[1.6] text-ink-body">
              You already have {queuedCount} application{queuedCount === 1 ? "" : "s"} in your review
              queue — review those first, then queue more from your feed.
            </p>
          ) : queuedCount > 0 ? (
            <p className="text-[14.5px] leading-[1.6] text-ink-body">
              {filling
                ? `We queued the top ${queuedCount} and the AI is filling them out from your profile right now. `
                : `We queued the top ${queuedCount} — they're safe, and will fill out from your profile as soon as processing is back online. `}
              Review each one — nothing is submitted without your approval.
            </p>
          ) : (
            <p className="text-[14.5px] leading-[1.6] text-ink-body">
              {error ?? "Head to your feed to queue the ones you like."}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            {queuedCount > 0 ? (
              <>
                <Link href="/applications" className={btnPrimary}>
                  Watch them fill →
                </Link>
                <Link href="/feed" className={btnLink}>
                  or browse the full feed
                </Link>
              </>
            ) : (
              <Link href="/feed" className={btnPrimary}>
                See your matches →
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "stalled") {
    return (
      <div className={`${cardCls} px-6 py-7 sm:px-7`}>
        <p className="text-[19px] font-bold tracking-[-0.02em] text-ink">
          This is taking longer than usual
        </p>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-body">
          Matching normally finishes in under a minute. The engine may be busy — you can kick it
          again or check your feed later; matching keeps running in the background.
        </p>
        {error && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-3 font-mono text-[13px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="button" onClick={retry} className={btnPrimary}>
            Retry
          </button>
          <Link href="/feed" className={btnLink}>
            Go to my feed
          </Link>
        </div>
      </div>
    );
  }

  // Live: the dark panel is what this system uses for anything still running.
  return (
    <div className={`${cardDarkCls} px-6 py-8 sm:px-7`}>
      <p className="flex items-center gap-2.5 font-mono text-[13px] text-lime">
        <Spinner />
        {phase === "queuing"
          ? "queuing your first applications…"
          : !embedded
            ? "reading your profile…"
            : "scoring every open job against your criteria…"}
      </p>
      <p className="mt-3 text-[14px] leading-[1.6] text-on-slate-mute">
        {phase === "queuing"
          ? `${matches} matches found — picking the best ${Math.min(AUTO_QUEUE_MAX, matches)} to start with.`
          : "We match on your target titles, seniority, industries and skills, and on your CV itself. Usually under a minute."}
      </p>
    </div>
  );
}
