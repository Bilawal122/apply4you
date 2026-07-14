"use client";

import { useState, useTransition } from "react";
import { queueTopMatches } from "@/app/(app)/actions";
import { Spinner, btnPrimary } from "@/components/ui";

export function QueueTopButton({ available }: { available: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const n = Math.min(10, available);

  if (available === 0) return null;

  return (
    <div className="flex items-center gap-3">
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
      {message && <span className="text-sm text-ink-soft">{message}</span>}
    </div>
  );
}
