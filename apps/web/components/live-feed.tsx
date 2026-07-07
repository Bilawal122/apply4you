"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface FeedEvent {
  id: number;
  application_id: string;
  status: string;
  message: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "text-green-700",
  failed: "text-red-600",
  submitting: "text-blue-700",
  approved: "text-neutral-600",
  draft: "text-neutral-600",
  needs_review: "text-amber-700",
  skipped: "text-neutral-400",
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
          // Status changes move cards between sections — refresh server data.
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
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold">Live activity</h2>
      <ul className="flex flex-col gap-1.5">
        {events.map((event) => (
          <li key={event.id} className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 text-xs tabular-nums text-neutral-400">
              {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className={`text-xs font-medium uppercase ${STATUS_STYLES[event.status] ?? "text-neutral-600"}`}>
              {event.status.replace("_", " ")}
            </span>
            <span className="text-neutral-600">{event.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
