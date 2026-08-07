"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner, btnGhost, btnSecondarySm, cardCls } from "@/components/ui";

/*
  The card is white like every other card, but the delete path stays brick from
  the first click to the last: an outlined brick pill, brick confirmation copy,
  then a solid brick pill. Softening this into a neutral "Manage account" row
  would make an irreversible action look like a settings toggle.
*/

const btnDangerOutline =
  "inline-flex items-center justify-center gap-2 rounded-full border border-danger/40 bg-card px-[18px] py-2.5 text-[13.5px] font-semibold text-danger transition-colors hover:border-danger hover:bg-danger-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger";

const btnDangerSolid =
  "inline-flex items-center justify-center gap-2 rounded-full bg-danger px-[18px] py-2.5 text-[13.5px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-50 disabled:pointer-events-none";

export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className={`${cardCls} mt-10 px-5 py-6 sm:px-7`}>
      <h2 className="label-mono">Your data</h2>
      <p className="mt-2 max-w-xl text-[14.5px] leading-[1.6] text-ink-body">
        Take a copy of everything we hold on you, or delete the account and all of it. Deletion is
        permanent — the files, the applications and the login all go, and we cannot bring them back.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a href="/api/account/export" className={btnSecondarySm}>
          Export all my data
        </a>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className={btnDangerOutline}>
            Delete my account
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-danger">Permanently delete everything?</span>
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
              className={btnDangerSolid}
            >
              {pending && <Spinner />}
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={btnGhost}>
              Cancel
            </button>
          </span>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}
    </div>
  );
}
