"use client";

import { useState, useTransition } from "react";
import { approveAllDrafts } from "@/app/(app)/applications/actions";

export function ApproveAllButton({ draftCount }: { draftCount: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (draftCount === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await approveAllDrafts();
            setMessage(res.error ?? `${res.approved} application${res.approved === 1 ? "" : "s"} approved`);
          })
        }
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Approving…" : `Approve all ${draftCount} ready`}
      </button>
      {message && <span className="text-sm text-neutral-500">{message}</span>}
    </div>
  );
}
