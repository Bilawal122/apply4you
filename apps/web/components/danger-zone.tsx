"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";

export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-12 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <h2 className="text-sm font-semibold text-red-800">Your data</h2>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a
          href="/api/account/export"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          Export all my data
        </a>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:border-red-500 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Delete my account
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-red-700">Permanently delete everything?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const res = await fetch("/api/account/delete", { method: "POST" });
                    if (res.ok) {
                      // The server deleted the auth user, but the local access
                      // token stays valid until it expires — clear it so the
                      // deleted account doesn't look signed in.
                      await createClient()
                        .auth.signOut({ scope: "local" })
                        .catch(() => undefined);
                      router.push("/");
                      router.refresh();
                      return;
                    }
                    const body = (await res.json().catch(() => null)) as { error?: string } | null;
                    setError(body?.error ?? "Delete failed — try again or contact support.");
                  } catch {
                    setError("Delete failed — check your connection and try again.");
                  }
                })
              }
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
            >
              {pending && <Spinner />}
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-neutral-500 underline transition-colors hover:text-neutral-700"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
