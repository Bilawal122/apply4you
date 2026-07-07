"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-12 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <h2 className="text-sm font-semibold text-red-800">Your data</h2>
      <div className="mt-2 flex items-center gap-3">
        <a
          href="/api/account/export"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium"
        >
          Export all my data
        </a>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700"
          >
            Delete my account
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-red-700">Permanently delete everything?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await fetch("/api/account/delete", { method: "POST" });
                  if (res.ok) router.push("/");
                })
              }
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-neutral-500 underline">
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
