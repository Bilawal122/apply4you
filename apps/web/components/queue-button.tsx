"use client";

import { useState, useTransition } from "react";
import { queueApplication } from "@/app/(app)/actions";
import { btnSecondary } from "@/components/ui";

export function QueueButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"queued" | string | null>(null);

  if (result === "queued") {
    return <span className="font-mono text-xs font-medium text-accent">queued ✓</span>;
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await queueApplication(jobId);
            setResult(res.error ?? "queued");
          })
        }
        className={btnSecondary}
      >
        {pending ? "Queuing…" : "Queue"}
      </button>
      {result && result !== "queued" && <span className="max-w-40 text-right text-xs text-danger">{result}</span>}
    </div>
  );
}
