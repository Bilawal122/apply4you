"use client";

import { useState, useTransition } from "react";
import { approveAllDrafts } from "@/app/(app)/applications/actions";
import { Spinner, btnPrimary } from "@/components/ui";

/*
 * Bulk approval stays on the dark commitment pill, not the outlined one: this
 * sends real applications and cannot be undone, and an outlined button in this
 * system means "reversible". Lime is reserved for the single approval a human
 * has actually read (see application-review.tsx).
 */
export function ApproveAllButton({ draftCount }: { draftCount: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (draftCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await approveAllDrafts();
            setMessage(res.error ?? `${res.approved} application${res.approved === 1 ? "" : "s"} approved`);
          })
        }
        className={btnPrimary}
      >
        {pending && <Spinner />}
        {pending ? `Approving ${draftCount}…` : `Approve all ${draftCount} ready`}
      </button>
      {message && <span className="font-mono text-[12.5px] text-ink-soft">{message}</span>}
    </div>
  );
}
