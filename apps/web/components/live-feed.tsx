"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cardCls } from "@/components/ui";

interface FeedEvent {
  id: number;
  application_id: string;
  status: string;
  message: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "text-accent",
  failed: "text-danger",
  submitting: "text-accent",
  approved: "text-ink-soft",
  draft: "text-ink-soft",
  needs_review: "text-attention",
  skipped: "text-ink-soft/60",
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
    <div className={`${cardCls} p-4`}>
      <h2 className="mb-2 text-sm font-semibold text-ink">Live activity</h2>
      <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {events.map((event) => (
          <li key={event.id} className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft/70">
              {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span
              className={`shrink-0 font-mono text-[11px] font-medium lowercase ${STATUS_COLORS[event.status] ?? "text-ink-soft"}`}
            >
              {event.status.replace("_", " ")}
            </span>
            <span className="text-ink-soft">{event.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
