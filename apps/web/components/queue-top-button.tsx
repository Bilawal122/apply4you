"use client";

import { useState, useTransition } from "react";
import { queueTopMatches } from "@/app/(app)/actions";
import { Spinner, btnPrimary } from "@/components/ui";

/**
 * The header action: the dark pill. It commits a batch to be drafted — still
 * short of sending, so it stays primary rather than lime.
 */
export function QueueTopButton({ available }: { available: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const n = Math.min(10, available);

  if (available === 0) return null;

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await queueTopMatches(n);
            setMessage(res.error ?? `${res.queued} queued — review them on the Applications page`);
          })
        }
        className={btnPrimary}
      >
        {pending && <Spinner />}
        {pending ? `Queuing ${n}…` : `Queue top ${n}`}
      </button>
      {message && <span className="max-w-xs text-[13px] leading-snug text-ink-soft">{message}</span>}
    </div>
  );
}
