import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueueButton } from "@/components/queue-button";
import { QueueTopButton } from "@/components/queue-top-button";
import { FeedFilters } from "@/components/feed-filters";
import { AutoRefresh } from "@/components/auto-refresh";
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
    apply_url: string;
    ats_type: string;
    posted_at: string | null;
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

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedParams> }) {
  const { q, ats, minScore, remote, sponsored } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("job_matches")
    .select("score, reason, jobs!inner(id, title, company, location, apply_url, ats_type, posted_at, sponsor_verdict)")
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

  const [{ data: matchRows }, { data: appliedRows }, { data: profileRow }, { count: totalMatches }] =
    await Promise.all([
      query.overrideTypes<MatchRow[]>(),
      supabase.from("applications").select("job_id"),
      supabase
        .from("profiles")
        .select("embedding, summary, resume_storage_path")
        .single<{ embedding: unknown; summary: string | null; resume_storage_path: string | null }>(),
      supabase.from("job_matches").select("job_id", { count: "exact", head: true }),
    ]);

  // Brand-new account with nothing set up yet -> guide them into the wizard
  // instead of dropping them on an empty feed.
  if (profileRow && !profileRow.resume_storage_path && !profileRow.summary?.trim()) {
    redirect("/onboarding");
  }

  const applied = new Set((appliedRows ?? []).map((r) => r.job_id as string));
  // `q` filters the embedded jobs to null rows on non-matches with !inner; drop those.
  const matches = (matchRows ?? []).filter((m) => m.jobs && !applied.has(m.jobs.id)).slice(0, 50);
  // Pending covers the embed AND the match write: the embedding lands seconds
  // before job_matches rows do, and both states should read "in progress".
  const matchingPending = !profileRow?.embedding || (totalMatches ?? 0) === 0;
  const filtered = Boolean(q || ats || minScore || remote || sponsored);
  const noResume = !profileRow?.resume_storage_path;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-2xl text-ink">Job feed</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Ranked by fit with your profile. Queue the ones you want — nothing submits until you
            approve it.
          </p>
        </div>
        <QueueTopButton available={matches.length} />
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
              : "You've queued everything that fits, or matching hasn't run since your last profile change. New jobs sync every 2 hours."}
          </p>
        </div>
      ) : (
        /*
          One ruled register rather than a stack of floating cards: these rows
          are a ranked list read top-down, and hairlines between entries make
          the ordering legible in a way that gaps between cards don't.
        */
        <div className={cardCls}>
          <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
            <p className="label-mono">Fit · position</p>
            <p className="label-mono">{matches.length} shown</p>
          </div>

          <ul className="px-4">
            {matches.map((m) => (
              <li key={m.jobs.id} className="field-rule py-4">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <ScoreBadge score={m.score} />

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/jobs/${m.jobs.id}`}
                      className="text-[15px] font-semibold leading-snug text-ink transition-colors hover:text-accent"
                    >
                      {m.jobs.title}
                    </Link>

                    <p className="mt-0.5 text-sm text-ink-soft">
                      {m.jobs.company}
                      {m.jobs.location ? ` · ${m.jobs.location}` : ""}
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                        {m.jobs.ats_type}
                      </span>
                    </p>

                    {m.jobs.sponsor_verdict?.licensed && (
                      <div className="mt-2">
                        <SponsorBadge verdict={m.jobs.sponsor_verdict} />
                      </div>
                    )}

                    {m.reason && (
                      <div className="mt-2.5 grid grid-cols-1 gap-x-3 sm:grid-cols-[4.5rem_1fr]">
                        <span className="label-mono pt-0.5">Why</span>
                        <p className="text-sm text-ink-soft">{m.reason}</p>
                      </div>
                    )}
                  </div>

                  <QueueButton jobId={m.jobs.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
