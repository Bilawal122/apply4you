"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cardDarkCls } from "@/components/ui";

interface FeedEvent {
  id: number;
  application_id: string;
  status: string;
  message: string | null;
  created_at: string;
}

/*
  The one dark panel in the app, because it is the one surface that is actually
  live. Read down the verb column and the point of the product is visible in a
  glance: lime for the machine getting somewhere, amber for the machine stopping
  and asking. A failure is never quieter than a success — it is the same weight,
  the same size, one column over. There is no bright brick on this palette and
  that is deliberate: "blocked", "needs you" and "failed" all mean the same thing
  to the person reading — something here wants your hands.
*/
const STATUS_COLORS: Record<string, string> = {
  submitted: "text-lime",
  submitting: "text-lime",
  approved: "text-on-slate",
  draft: "text-on-slate-mute",
  needs_review: "text-attention-bright",
  failed: "text-attention-bright",
  needs_manual_verification: "text-attention-bright",
  skipped: "text-on-slate-faint",
};

/** FR-35: live submission feed via Supabase Realtime on application_events. */
export function LiveFeed({ initialEvents, userId }: { initialEvents: FeedEvent[]; userId: string }) {
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("application-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "application_events", filter: `user_id=eq.${userId}` },
        (payload) => {
          const event = payload.new as FeedEvent;
          setEvents((prev) => [event, ...prev].slice(0, 30));
          if (["submitted", "failed", "draft", "needs_review"].includes(event.status)) router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  if (events.length === 0) return null;

  return (
    <section className={`${cardDarkCls} px-6 py-6 sm:px-7`} aria-labelledby="live-feed-heading">
      <div className="flex items-center gap-2">
        {/* .blip is the slow blink from globals.css, and it stands down under
            prefers-reduced-motion. */}
        <span className="blip h-1.5 w-1.5 shrink-0 rounded-full bg-lime" aria-hidden="true" />
        <h2
          id="live-feed-heading"
          className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-on-slate-faint"
        >
          Live activity
        </h2>
      </div>

      <ul className="mt-5 flex max-h-48 flex-col gap-3 overflow-y-auto font-mono text-[11.5px] leading-[1.4]">
        {events.map((event) => (
          <li key={event.id} className="flex items-baseline gap-2.5">
            <span className="shrink-0 tabular-nums text-on-slate-faint">
              {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className={`shrink-0 lowercase ${STATUS_COLORS[event.status] ?? "text-on-slate-mute"}`}>
              {event.status.replace("_", " ")}
            </span>
            <span className="min-w-0 break-words text-on-slate-soft">{event.message}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 border-t border-slate-hair pt-4 text-[12.5px] text-on-slate-faint">
        Failures show up as loudly as successes.
      </p>
    </section>
  );
}
