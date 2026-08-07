"use client";

import { useState, useTransition } from "react";
import { queueApplication } from "@/app/(app)/actions";
import { Spinner, btnSecondarySm } from "@/components/ui";

/**
 * The row-level action: an outlined pill, because queuing is reversible — the
 * application is drafted and then waits for you. Nothing here sends anything,
 * which is why it is never the lime button.
 */
export function QueueButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"queued" | string | null>(null);

  if (result === "queued") {
    return <span className="shrink-0 font-mono text-[12px] font-medium text-accent">queued ✓</span>;
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
        className={btnSecondarySm}
      >
        {pending && <Spinner />}
        {pending ? "Queuing…" : "Fill it"}
      </button>
      {result && result !== "queued" && (
        <span className="max-w-40 text-right text-[12px] leading-snug text-danger">{result}</span>
      )}
    </div>
  );
}
