"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueTopMatches } from "@/app/(app)/actions";
import { Spinner, btnPrimary } from "@/components/ui";

/**
 * Auto Apply — one click and the AI does the whole application for every job it
 * picks: reads the employer's form, fills every field from the profile, tailors
 * a CV and writes a cover letter.
 *
 * It stops at the send. That is not a missing feature, it is the product
 * (DECISIONS.md D3/D6, and the promise made on the landing page). The
 * `auto_submit` column exists for the day that changes, but nothing reads it
 * yet and nothing should until submission success is measured — the number of
 * applications this system has successfully submitted is currently zero.
 *
 * The batch size is capped by what the user can actually SEND this period, not
 * just by how many matches exist. Queuing 25 against a 10-submission plan would
 * spend real AI budget producing drafts that the approval gate then refuses.
 */
export function AutoApplyButton({
  available,
  dailyCap,
  planRemaining,
  planResets,
}: {
  available: number;
  dailyCap: number;
  planRemaining: number;
  planResets: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (available === 0) return null;

  if (planRemaining <= 0) {
    return (
      <p className="max-w-xs text-[11px] leading-snug text-ink-soft sm:text-right">
        Plan limit reached{planResets ? ` — resets ${planResets}` : ""}. Existing drafts are still
        yours to review.
      </p>
    );
  }

  const n = Math.min(available, dailyCap, planRemaining, 25);
  const cappedByPlan = planRemaining < Math.min(available, dailyCap, 25);

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const res = await queueTopMatches(n);
            if (res.error) {
              setMessage(res.error);
              return;
            }
            setMessage(`${res.queued} started — the AI is filling them now`);
            router.refresh();
          })
        }
        className={`${btnPrimary} px-5 py-2.5`}
      >
        {pending && <Spinner />}
        {pending ? `Starting ${n}…` : `Auto-apply to top ${n}`}
      </button>

      <p className="max-w-xs text-[11px] leading-snug text-ink-soft sm:text-right">
        {message ?? (
          <>
            AI fills every form, tailors your CV and writes each cover letter — then stops so you can
            approve.
            {cappedByPlan && ` ${n} is all your plan can send right now.`}
          </>
        )}
      </p>
    </div>
  );
}
