import Link from "next/link";
import {
  REVIEW_RED_FLAG_SECONDS,
  ReviewMetricsSchema,
  currentUsagePeriod,
  summariseReviews,
  type ReviewMetrics,
} from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { AutoApplyButton } from "@/components/auto-apply-button";
import { ScoreBadge, SponsorBadge, cardCls } from "@/components/ui";
import type { SponsorVerdict } from "@/lib/sponsors";

interface MatchRow {
  score: number;
  reason: string | null;
  jobs: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    ats_type: string;
    posted_at: string | null;
    sponsor_verdict: SponsorVerdict | null;
  };
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <p className="label-mono">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums leading-none text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function postedLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const d = new Date(postedAt);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A tag only appears when the underlying data actually says so — never inferred for decoration. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[2px] border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
      {children}
    </span>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const startOfToday = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();

  const [
    { count: totalSubmitted },
    { count: submittedToday },
    { count: pendingReview },
    { count: matched },
    { count: failed },
    { data: sub },
    { data: matchRows },
    { data: appliedRows },
    { data: prefs },
    { data: reviewRows },
  ] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .gte("submitted_at", startOfToday),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "needs_review"]),
    supabase.from("job_matches").select("job_id", { count: "exact", head: true }),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("subscriptions").select("plan, applications_limit, period_start").single(),
    supabase
      .from("job_matches")
      .select("score, reason, jobs!inner(id, title, company, location, ats_type, posted_at, sponsor_verdict)")
      .is("jobs.closed_at", null)
      .order("score", { ascending: false })
      .limit(60)
      .overrideTypes<MatchRow[]>(),
    supabase.from("applications").select("job_id"),
    supabase.from("preferences").select("daily_cap").single<{ daily_cap: number }>(),
    supabase
      .from("applications")
      .select("review_metrics")
      .not("review_metrics", "is", null)
      .order("created_at", { ascending: false })
      .limit(100)
      .overrideTypes<{ review_metrics: unknown }[]>(),
  ]);

  // Usage is submissions in the current rolling period (auto-resets) — matches
  // the approval gate, not the never-resetting applications_used counter.
  let planUsed = 0;
  let planResets: string | null = null;
  if (sub) {
    const { start, end } = currentUsagePeriod(sub.period_start);
    planResets = end.toLocaleDateString();
    const { count } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .gte("submitted_at", start.toISOString());
    planUsed = count ?? 0;
  }

  const applied = new Set((appliedRows ?? []).map((r) => r.job_id as string));
  const recommended = (matchRows ?? []).filter((m) => m.jobs && !applied.has(m.jobs.id));
  const dailyCap = prefs?.daily_cap ?? 10;

  // Review quality (DECISIONS.md D6). Rows approved before the instrumentation
  // existed carry no metrics and are simply absent from the sample.
  const review = summariseReviews(
    (reviewRows ?? [])
      .map((r) => ReviewMetricsSchema.safeParse(r.review_metrics))
      .filter((p): p is { success: true; data: ReviewMetrics } => p.success)
      .map((p) => p.data),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl text-ink">Dashboard</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Your matches, and everything the AI has done so far.
          </p>
        </div>
        <AutoApplyButton
          available={recommended.length}
          dailyCap={dailyCap}
          planRemaining={sub ? Math.max(0, (sub.applications_limit ?? 0) - planUsed) : 0}
          planResets={planResets}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Submitted total" value={totalSubmitted ?? 0} />
        <Stat label="Submitted today" value={submittedToday ?? 0} />
        <Stat label="Waiting for review" value={pendingReview ?? 0} />
        {/* Counts what the feed shows — matches you have NOT already queued.
            The raw job_matches total includes applied jobs and disagreed with the
            feed's own number under the same label. */}
        <Stat label="Jobs to review" value={recommended.length} hint={`${matched ?? 0} matched in total`} />
        <Stat label="Failed" value={failed ?? 0} hint={failed ? "apply manually" : undefined} />
        {sub && (
          <Stat
            label={`Plan · ${sub.plan}`}
            value={`${planUsed} / ${sub.applications_limit}`}
            hint={planResets ? `resets ${planResets}` : undefined}
          />
        )}
      </div>

      {review.sample > 0 && (
        <section>
          <h2 className="display mb-3 text-lg text-ink">Review quality</h2>
          {/* Swapped wholesale rather than appended to cardCls: two competing
              bg-/border- utilities are the same specificity, so which one wins
              is down to CSS source order, not the order they're written here. */}
          <div
            className={`p-4 ${
              review.redFlag
                ? "rounded-[3px] border border-attention/40 bg-attention-soft"
                : cardCls
            }`}
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="label-mono">Median review</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums leading-none text-ink">
                  {review.medianSeconds}s
                </p>
              </div>
              <div>
                <p className="label-mono">You changed something</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums leading-none text-ink">
                  {Math.round(review.editRate * 100)}%
                </p>
              </div>
              <div>
                <p className="label-mono">Approved unopened</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums leading-none text-ink">
                  {Math.round(review.unopenedRate * 100)}%
                </p>
              </div>
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-soft">
              {review.redFlag ? (
                <>
                  <span className="font-medium text-attention">
                    Median review is under {REVIEW_RED_FLAG_SECONDS}s.
                  </span>{" "}
                  DECISIONS.md D6 treats that as a red flag equal to a failed submission — the review
                  gate is the product, and at this speed it isn&apos;t really happening. Worth slowing
                  down before the friends beta.
                </>
              ) : (
                <>Across your last {review.sample} approval{review.sample === 1 ? "" : "s"}. D6 wants a
                median above {REVIEW_RED_FLAG_SECONDS}s — a gate nobody reads is not a gate.</>
              )}
            </p>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="display text-lg text-ink">Recommended jobs</h2>
            <span className="rounded-[2px] border border-line bg-card px-1.5 py-0.5 font-mono text-xs tabular-nums text-ink-soft">
              {recommended.length}
            </span>
          </div>
          <Link
            href="/feed"
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent hover:underline"
          >
            see all with filters ↗
          </Link>
        </div>

        {recommended.length === 0 ? (
          <div className={`${cardCls} p-10 text-center`}>
            <p className="text-sm font-medium text-ink">Nothing new to recommend</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              You&apos;ve queued everything that fits right now. New roles appear as company boards
              are re-polled — or widen your{" "}
              <Link href="/preferences" className="underline decoration-line underline-offset-2">
                preferences
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recommended.slice(0, 9).map((m) => {
              const posted = postedLabel(m.jobs.posted_at);
              const remote = /remote/i.test(m.jobs.location ?? "");
              return (
                <li key={m.jobs.id} className={`${cardCls} flex flex-col p-4 transition-colors hover:border-ink-soft/40`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                      {posted ?? m.jobs.ats_type}
                    </span>
                    <ScoreBadge score={m.score} />
                  </div>

                  <p className="mt-2 text-sm text-ink-soft">{m.jobs.company}</p>
                  <Link
                    href={`/jobs/${m.jobs.id}`}
                    className="mt-0.5 text-[15px] font-semibold leading-snug text-ink transition-colors hover:text-accent"
                  >
                    {m.jobs.title}
                  </Link>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {remote && <Tag>remote</Tag>}
                    <Tag>{m.jobs.ats_type}</Tag>
                    {m.jobs.sponsor_verdict?.licensed && <SponsorBadge verdict={m.jobs.sponsor_verdict} />}
                  </div>

                  {m.reason && (
                    <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{m.reason}</p>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    <span className="min-w-0 truncate text-xs text-ink-faint">
                      {m.jobs.location ?? "—"}
                    </span>
                    <Link
                      href={`/jobs/${m.jobs.id}`}
                      className="shrink-0 rounded-[3px] border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink-soft hover:bg-paper"
                    >
                      Details
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
