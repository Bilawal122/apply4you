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
import {
  Chip,
  ScoreBadge,
  SponsorBadge,
  btnLink,
  btnSecondarySm,
  cardCls,
  cardDarkCls,
} from "@/components/ui";
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

/**
 * A stat tile. `tone="lime"` is the affirmative one — reserved for the count of
 * things actually sent, so the single lime block on the page is the only number
 * that represents work completed rather than work outstanding.
 */
function Stat({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "plain" | "lime";
}) {
  const lime = tone === "lime";
  return (
    <div className={`${lime ? "rounded-[22px] bg-lime" : cardCls} col-span-6 px-6 py-6 md:col-span-3`}>
      <p className={`font-mono text-[30px] leading-none tabular-nums sm:text-[34px] ${lime ? "text-lime-ink" : "text-ink"}`}>
        {value}
      </p>
      <p className={`mt-2 text-[13.5px] leading-snug ${lime ? "text-lime-ink" : "text-ink-soft"}`}>{label}</p>
      {hint && (
        <p className={`mt-1 font-mono text-[11px] ${lime ? "text-lime-ink/70" : "text-ink-faint"}`}>{hint}</p>
      )}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

function postedLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const d = new Date(postedAt);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Bucket key for a UTC calendar day — the same day boundary the counts above use. */
function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const todayUtc = new Date(new Date().setUTCHours(0, 0, 0, 0));
  const startOfToday = todayUtc.toISOString();
  // Seven buckets ending today, so the last bar is "submitted today".
  const weekStart = new Date(todayUtc.getTime() - 6 * DAY_MS);

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
    { data: weekRows },
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
      .in("status", ["draft", "needs_review"])
      // A null form_schema was never filled — it is waiting on the worker,
      // not on the user, and the applications page says so. This count
      // feeds "waiting for your approval", so it must use the same split.
      .not("form_schema", "is", null),
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
    // The only new read: the timestamps behind the "last 7 days" chart. Every
    // bar is a real submission — the chart is omitted entirely rather than
    // drawn from anything invented.
    supabase
      .from("applications")
      .select("submitted_at")
      .eq("status", "submitted")
      .gte("submitted_at", weekStart.toISOString())
      .overrideTypes<{ submitted_at: string | null }[]>(),
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

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * DAY_MS);
    return { key: dayKey(d), label: WEEKDAYS[d.getUTCDay()], count: 0 };
  });
  const weekIndex = new Map(week.map((b, i) => [b.key, i] as const));
  for (const row of weekRows ?? []) {
    if (!row.submitted_at) continue;
    const i = weekIndex.get(dayKey(new Date(row.submitted_at)));
    if (i !== undefined) week[i].count += 1;
  }
  const weekTotal = week.reduce((n, b) => n + b.count, 0);
  const weekPeak = Math.max(1, ...week.map((b) => b.count));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:items-end">
        <div>
          <h1 className="display text-[30px] text-ink sm:text-[34px]">Dashboard</h1>
          <p className="mt-2 text-[15.5px] text-ink-soft">
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

      <div className="grid grid-cols-12 gap-3.5">
        <Stat label="waiting for your approval" value={pendingReview ?? 0} />
        {/* Counts what the feed shows — matches you have NOT already queued.
            The raw job_matches total includes applied jobs and disagreed with the
            feed's own number under the same label. */}
        <Stat
          label="matched, not yet filled"
          value={recommended.length}
          hint={`${matched ?? 0} matched in total`}
        />
        <Stat label="failed to submit" value={failed ?? 0} hint={failed ? "apply manually" : undefined} />
        <Stat label="sent in total" value={totalSubmitted ?? 0} tone="lime" />

        <section
          className={`${cardCls} col-span-12 px-6 py-6 sm:px-7 ${sub ? "lg:col-span-8" : ""}`}
          aria-labelledby="sent-chart-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="sent-chart-heading" className="label-mono">
              Applications sent
            </h2>
            <span className="font-mono text-[11.5px] text-ink-soft">last 7 days</span>
          </div>

          <div className="mt-6 flex items-end gap-2 sm:gap-3">
            {week.map((bucket, i) => (
              <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10.5px] tabular-nums text-ink-faint">{bucket.count}</span>
                <div className="flex h-[130px] w-full items-end">
                  <div
                    className={`w-full rounded-lg ${
                      bucket.count === 0 ? "bg-line-soft" : i === week.length - 1 ? "bg-ink" : "bg-line"
                    }`}
                    style={{
                      height: bucket.count === 0 ? "3px" : `${Math.max(8, (bucket.count / weekPeak) * 100)}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10.5px] text-ink-soft">{bucket.label}</span>
              </div>
            ))}
          </div>

          <p className="mt-5 border-t border-line-soft pt-4 font-mono text-[11.5px] tabular-nums text-ink-soft">
            {submittedToday ?? 0} today · {weekTotal} in the last 7 days
          </p>
        </section>

        {sub && (
          <section
            className={`${cardDarkCls} col-span-12 px-6 py-6 sm:px-7 lg:col-span-4`}
            aria-labelledby="plan-heading"
          >
            <h2
              id="plan-heading"
              className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-on-slate-faint"
            >
              Plan · {sub.plan}
            </h2>
            <p className="mt-5 font-mono text-[34px] leading-none tabular-nums text-on-slate">
              {planUsed} / {sub.applications_limit}
            </p>
            <p className="mt-2 text-[13.5px] text-on-slate-soft">submitted this period</p>
            {planResets && (
              <p className="mt-5 border-t border-slate-hair pt-4 font-mono text-[11.5px] text-on-slate-faint">
                resets {planResets}
              </p>
            )}
          </section>
        )}

        {review.sample > 0 && (
          /* Swapped wholesale rather than appended to cardCls: two competing
             bg-/border- utilities are the same specificity, so which one wins
             is down to CSS source order, not the order they're written here. */
          <section
            className={`col-span-12 px-6 py-6 sm:px-7 ${
              review.redFlag ? "rounded-[22px] bg-attention-soft" : cardCls
            }`}
            aria-labelledby="review-quality-heading"
          >
            <h2 id="review-quality-heading" className="label-mono">
              Review quality
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <div>
                <p className="font-mono text-[26px] leading-none tabular-nums text-ink">
                  {review.medianSeconds}s
                </p>
                <p className="mt-2 text-[13.5px] text-ink-soft">median review</p>
              </div>
              <div>
                <p className="font-mono text-[26px] leading-none tabular-nums text-ink">
                  {Math.round(review.editRate * 100)}%
                </p>
                <p className="mt-2 text-[13.5px] text-ink-soft">you changed something</p>
              </div>
              <div>
                <p className="font-mono text-[26px] leading-none tabular-nums text-ink">
                  {Math.round(review.unopenedRate * 100)}%
                </p>
                <p className="mt-2 text-[13.5px] text-ink-soft">approved unopened</p>
              </div>
            </div>
            <p className="mt-5 border-t border-line-soft pt-4 text-[13.5px] leading-[1.6] text-ink-body">
              {review.redFlag ? (
                <>
                  <span className="font-semibold text-attention">
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
          </section>
        )}

        <section
          className={`${cardCls} col-span-12 px-6 py-6 sm:px-7`}
          aria-labelledby="recommended-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 id="recommended-heading" className="label-mono">
                Recommended jobs
              </h2>
              <span className="font-mono text-[11.5px] tabular-nums text-ink-faint">
                {recommended.length}
              </span>
            </div>
            <Link href="/feed" className={btnLink}>
              see all with filters ↗
            </Link>
          </div>

          {recommended.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[15px] font-semibold text-ink">Nothing new to recommend</p>
              <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-[1.6] text-ink-body">
                You&apos;ve queued everything that fits right now. New roles appear as company boards
                are re-polled — or widen your{" "}
                <Link href="/preferences" className="underline decoration-line underline-offset-2">
                  preferences
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col">
              {recommended.slice(0, 9).map((m) => {
                const posted = postedLabel(m.jobs.posted_at);
                const remote = /remote/i.test(m.jobs.location ?? "");
                return (
                  <li
                    key={m.jobs.id}
                    className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line-soft py-3.5 first:border-t-0"
                  >
                    <div className="flex min-w-0 grow basis-[15rem] items-center gap-4">
                      <ScoreBadge score={m.score} />
                      <div className="min-w-0">
                        <Link
                          href={`/jobs/${m.jobs.id}`}
                          className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-ink transition-colors hover:text-accent"
                        >
                          {m.jobs.title}
                        </Link>
                        <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                          {m.jobs.company} · {m.jobs.location ?? "—"}
                        </p>
                        {m.reason && (
                          <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-ink-faint">
                            {m.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:w-[11.5rem]">
                      {remote && <Chip>remote</Chip>}
                      <Chip>{m.jobs.ats_type}</Chip>
                      {m.jobs.sponsor_verdict?.licensed && (
                        <SponsorBadge verdict={m.jobs.sponsor_verdict} location={m.jobs.location} />
                      )}
                    </div>

                    {/* The ATS name already has its own chip, so an unknown
                        posting date stays an honest blank rather than borrowing it. */}
                    <span className="font-mono text-[12px] text-ink-soft sm:w-[7.5rem]">
                      {posted ?? "—"}
                    </span>

                    <Link href={`/jobs/${m.jobs.id}`} className={btnSecondarySm}>
                      Details
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
