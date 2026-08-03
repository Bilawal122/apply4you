import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUsagePeriod } from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { descriptionExcerpt } from "@/lib/text";
import { formatSalary } from "@/lib/salary";
import { QueueButton } from "@/components/queue-button";
import { AutoApplyButton } from "@/components/auto-apply-button";
import { FeedFilters } from "@/components/feed-filters";
import { AutoRefresh } from "@/components/auto-refresh";
import { ScoreBadge, SponsorBadge, cardCls } from "@/components/ui";
import type { SponsorVerdict } from "@/lib/sponsors";

/** Cards are large, so the feed shows a page of them rather than 50 rows. */
const CARDS_SHOWN = 24;

interface MatchRow {
  score: number;
  reason: string | null;
  jobs: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    apply_url: string;
    ats_type: string;
    posted_at: string | null;
    requires_login: boolean;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string | null;
    salary_period: string | null;
    salary_summary: string | null;
    sponsor_verdict: SponsorVerdict | null;
  };
}

interface FeedParams {
  q?: string;
  ats?: string;
  minScore?: string;
  remote?: string;
  sponsored?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function postedLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const d = new Date(postedAt);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[2px] border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
      {children}
    </span>
  );
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedParams> }) {
  const { q, ats, minScore, remote, sponsored } = await searchParams;
  const supabase = await createClient();

  // Descriptions average ~8KB (Greenhouse stores full HTML), so they are NOT
  // selected here — pulling them for all 200 candidate matches would move
  // ~1.6MB per feed render. They are fetched below for the cards actually shown.
  let query = supabase
    .from("job_matches")
    .select(
      "score, reason, jobs!inner(id, title, company, location, apply_url, ats_type, posted_at, requires_login, sponsor_verdict, salary_min, salary_max, salary_currency, salary_period, salary_summary)",
    )
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    .limit(200);

  if (minScore) query = query.gte("score", Number(minScore));
  if (ats && ["greenhouse", "lever", "ashby", "workable"].includes(ats)) query = query.eq("jobs.ats_type", ats);
  if (remote === "1") query = query.ilike("jobs.location", "%remote%");
  if (sponsored === "1") query = query.not("jobs.sponsor_verdict", "is", null);
  if (q) {
    // Strip characters significant to PostgREST filter syntax so user input
    // can't break out of the ilike pattern and inject OR conditions.
    const safe = q.replace(/[,()*\\%:"]/g, "").slice(0, 80).trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,company.ilike.%${safe}%`, { referencedTable: "jobs" });
  }

  const [{ data: matchRows }, { data: appliedRows }, { data: profileRow }, { count: totalMatches }, { data: sub }, { data: prefs }] =
    await Promise.all([
      query.overrideTypes<MatchRow[]>(),
      supabase.from("applications").select("job_id"),
      supabase
        .from("profiles")
        .select("embedding, summary, resume_storage_path")
        .single<{ embedding: unknown; summary: string | null; resume_storage_path: string | null }>(),
      supabase.from("job_matches").select("job_id", { count: "exact", head: true }),
      supabase.from("subscriptions").select("plan, applications_limit, period_start").single(),
      supabase.from("preferences").select("daily_cap").single<{ daily_cap: number }>(),
    ]);

  // Brand-new account with nothing set up yet -> guide them into the wizard
  // instead of dropping them on an empty feed.
  if (profileRow && !profileRow.resume_storage_path && !profileRow.summary?.trim()) {
    redirect("/onboarding");
  }

  const applied = new Set((appliedRows ?? []).map((r) => r.job_id as string));
  // `q` filters the embedded jobs to null rows on non-matches with !inner; drop those.
  const available = (matchRows ?? []).filter((m) => m.jobs && !applied.has(m.jobs.id));
  const matches = available.slice(0, CARDS_SHOWN);

  // Second query, scoped to the visible cards only — see the note above.
  const descriptions = new Map<string, string>();
  if (matches.length > 0) {
    const { data: descRows } = await supabase
      .from("jobs")
      .select("id, description")
      .in("id", matches.map((m) => m.jobs.id))
      .overrideTypes<{ id: string; description: string | null }[]>();
    for (const row of descRows ?? []) {
      const excerpt = descriptionExcerpt(row.description);
      if (excerpt) descriptions.set(row.id, excerpt);
    }
  }

  // Pending covers the embed AND the match write: the embedding lands seconds
  // before job_matches rows do, and both states should read "in progress".
  const matchingPending = !profileRow?.embedding || (totalMatches ?? 0) === 0;
  const filtered = Boolean(q || ats || minScore || remote || sponsored);
  const noResume = !profileRow?.resume_storage_path;

  let planRemaining = 0;
  let planResets: string | null = null;
  if (sub) {
    const { start, end } = currentUsagePeriod(sub.period_start);
    planResets = end.toLocaleDateString();
    const { count: used } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .gte("submitted_at", start.toISOString());
    planRemaining = Math.max(0, (sub.applications_limit ?? 0) - (used ?? 0));
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl text-ink">Job feed</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Ranked by fit with your profile. Nothing is submitted until you approve it.
          </p>
        </div>
        {!matchingPending && (
          <AutoApplyButton
            available={available.length}
            dailyCap={prefs?.daily_cap ?? 10}
            planRemaining={planRemaining}
            planResets={planResets}
          />
        )}
      </div>

      {noResume && (
        <div className="mb-4 rounded-[3px] border border-attention/30 bg-attention-soft px-4 py-3 text-sm">
          <span className="font-medium text-attention">No resume on file.</span>{" "}
          <span className="text-ink-soft">
            Applications can&apos;t be submitted without one —{" "}
            <Link href="/onboarding" className="font-medium text-ink underline decoration-line underline-offset-2">
              upload your resume
            </Link>{" "}
            to unlock submissions.
          </span>
        </div>
      )}

      {!matchingPending && <FeedFilters />}

      {matchingPending ? (
        <div className={`${cardCls} p-10 text-center`}>
          <AutoRefresh />
          <p className="label-mono text-accent">matching in progress…</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-ink-soft">
            We&apos;re reading your profile against every open job. This takes about a minute after you
            save your <Link href="/profile" className="underline decoration-line underline-offset-2">profile</Link> and{" "}
            <Link href="/preferences" className="underline decoration-line underline-offset-2">preferences</Link> — this page refreshes
            itself.
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
            Still here after a few minutes? Your criteria may be too narrow — try widening your{" "}
            <Link href="/preferences" className="underline decoration-line underline-offset-2">preferences</Link>.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <div className={`${cardCls} p-10 text-center`}>
          <p className="text-sm font-medium text-ink">
            {filtered ? "No matches for these filters" : "No unqueued matches right now"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {filtered
              ? "Try widening your search or clearing filters."
              : "You've queued everything that fits, or matching hasn't run since your last profile change. New jobs appear as company boards are re-polled."}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="label-mono">
              showing {matches.length} of {available.length}
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((m) => {
              const posted = postedLabel(m.jobs.posted_at);
              const isRemote = /remote/i.test(m.jobs.location ?? "");
              const excerpt = descriptions.get(m.jobs.id);
              return (
                <li
                  key={m.jobs.id}
                  className={`${cardCls} flex flex-col p-4 transition-colors hover:border-ink-soft/40`}
                >
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
                    {isRemote && <Tag>remote</Tag>}
                    <Tag>{m.jobs.ats_type}</Tag>
                    {m.jobs.requires_login && <Tag>account needed</Tag>}
                    {m.jobs.sponsor_verdict?.licensed && <SponsorBadge verdict={m.jobs.sponsor_verdict} />}
                  </div>

                  {m.reason && (
                    <p className="mt-2.5 text-[13px] leading-snug text-ink">
                      <span className="label-mono">Why</span> {m.reason}
                    </p>
                  )}

                  {excerpt && (
                    <p className="mt-2 line-clamp-4 text-[13px] leading-snug text-ink-soft">{excerpt}</p>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {/* Employer-published only. Never estimated — see lib/salary.ts. */}
                      {formatSalary(m.jobs) ? (
                        <span className="truncate font-mono text-xs font-medium text-ink">{formatSalary(m.jobs)}</span>
                      ) : (
                        <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                          salary not stated
                        </span>
                      )}
                      <span className="min-w-0 truncate text-xs text-ink-faint">{m.jobs.location ?? "—"}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/jobs/${m.jobs.id}`}
                        className="rounded-[3px] border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink-soft hover:bg-paper"
                      >
                        Details
                      </Link>
                      <QueueButton jobId={m.jobs.id} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
