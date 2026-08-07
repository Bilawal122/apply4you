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
import { Chip, ScoreBadge, SponsorBadge, cardCls } from "@/components/ui";
import type { SponsorVerdict } from "@/lib/sponsors";

/** The feed is a register, not an inbox — it shows a page of rows, not all 200. */
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

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedParams> }) {
  const { q, ats, minScore, remote, sponsored } = await searchParams;
  const supabase = await createClient();

  // Descriptions average ~8KB (Greenhouse stores full HTML), so they are NOT
  // selected here — pulling them for all 200 candidate matches would move
  // ~1.6MB per feed render. They are fetched below for the rows actually shown.
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

  // Second query, scoped to the visible rows only — see the note above.
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

  // The masthead states a number this page can actually stand behind: matched,
  // still open, not already queued — i.e. exactly the rows below it, narrowed by
  // whatever filters are lit. Never a catalogue size, never a refresh cadence.
  // ("matched roles to fill" rather than "matched your profile" because the ones
  // you've already queued are matches too — they're just no longer on this list.)
  const n = available.length;
  const headline = matchingPending ? "Job feed" : `${n} matched ${n === 1 ? "role" : "roles"} to fill`;

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
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h1 className="display text-[28px] text-ink sm:text-[34px]">{headline}</h1>
          <p className="mt-2 text-[15.5px] text-ink-soft">
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
        <div className="mb-4 rounded-2xl bg-attention-soft px-5 py-4 text-[14.5px] leading-[1.6]">
          <span className="font-semibold text-attention">No resume on file.</span>{" "}
          <span className="text-ink-body">
            Applications can&apos;t be submitted without one —{" "}
            <Link href="/onboarding" className="font-semibold text-ink underline underline-offset-2">
              upload your resume
            </Link>{" "}
            to unlock submissions.
          </span>
        </div>
      )}

      {!matchingPending && <FeedFilters />}

      {matchingPending ? (
        <div className={`${cardCls} px-6 py-14 text-center`}>
          <AutoRefresh />
          <p className="label-mono text-accent">matching in progress…</p>
          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-[1.6] text-ink-body">
            We&apos;re reading your profile against every open job. This takes about a minute after you
            save your <Link href="/profile" className="underline underline-offset-2">profile</Link> and{" "}
            <Link href="/preferences" className="underline underline-offset-2">preferences</Link> — this page refreshes
            itself.
          </p>
          <p className="mx-auto mt-2.5 max-w-md text-[13px] leading-[1.55] text-ink-faint">
            Still here after a few minutes? Your criteria may be too narrow — try widening your{" "}
            <Link href="/preferences" className="underline underline-offset-2">preferences</Link>.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <div className={`${cardCls} px-6 py-14 text-center`}>
          <p className="text-[19px] font-bold tracking-[-0.02em] text-ink">
            {filtered ? "No matches for these filters" : "No unqueued matches right now"}
          </p>
          <p className="mx-auto mt-2.5 max-w-md text-[14.5px] leading-[1.6] text-ink-body">
            {filtered
              ? "Try widening your search or clearing filters."
              : "You've queued everything that fits, or matching hasn't run since your last profile change. New jobs appear as company boards are re-polled."}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="label-mono">
              showing {matches.length} of {available.length}
            </p>
            <p className="label-mono">sorted by fit</p>
          </div>

          {/* One register: every row lives in the same sheet of paper, separated
              by a hairline rather than by whitespace between cards. */}
          <ul className={`${cardCls} px-5 py-1 sm:px-7`}>
            {matches.map((m) => {
              const posted = postedLabel(m.jobs.posted_at);
              const salary = formatSalary(m.jobs);
              // Our own rationale outranks the employer's boilerplate; the
              // excerpt only takes the line when there is no reason to show.
              const excerpt = m.reason ? null : descriptions.get(m.jobs.id);
              return (
                <li
                  key={m.jobs.id}
                  className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b border-line-soft py-4 last:border-b-0 md:grid-cols-[2.75rem_minmax(0,1fr)_auto] md:items-center md:gap-x-5"
                >
                  <ScoreBadge score={m.score} />

                  <div className="min-w-0">
                    <Link
                      href={`/jobs/${m.jobs.id}`}
                      className="block truncate text-[16px] font-semibold tracking-[-0.015em] text-ink transition-colors hover:text-accent"
                    >
                      {m.jobs.title}
                    </Link>
                    <p className="mt-0.5 truncate text-[13.5px] text-ink-soft">
                      {m.jobs.company} · {m.jobs.location ?? "—"} ·{" "}
                      {/* Employer-published only. Never estimated — see lib/salary.ts. */}
                      {salary ? (
                        <span className="font-mono text-[12.5px] text-ink-body">{salary}</span>
                      ) : (
                        <span className="font-mono text-[12.5px] text-ink-faint">salary not stated</span>
                      )}
                    </p>
                    {m.reason && (
                      <p className="mt-1 truncate text-[13px] text-ink-soft" title={m.reason}>
                        <span className="label-mono">why</span> {m.reason}
                      </p>
                    )}
                    {excerpt && <p className="mt-1 truncate text-[13px] text-ink-faint">{excerpt}</p>}
                  </div>

                  <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 md:col-span-1 md:flex-nowrap md:justify-end">
                    <SponsorBadge verdict={m.jobs.sponsor_verdict} />
                    {m.jobs.requires_login && <Chip>account needed</Chip>}
                    <span className="font-mono text-[12px] text-ink-soft">{posted ?? m.jobs.ats_type}</span>
                    <QueueButton jobId={m.jobs.id} />
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
