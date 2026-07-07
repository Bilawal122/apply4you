"use client";

import { useState, useTransition } from "react";
import { queueApplication } from "@/app/(app)/actions";

export function QueueButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"queued" | string | null>(null);

  if (result === "queued") {
    return <span className="text-sm font-medium text-green-700">Queued ✓</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await queueApplication(jobId);
            setResult(res.error ?? "queued");
          })
        }
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Queuing…" : "Queue application"}
      </button>
      {result && result !== "queued" && <span className="text-xs text-red-600">{result}</span>}
    </div>
  );
}
