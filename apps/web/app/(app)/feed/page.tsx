import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QueueButton } from "@/components/queue-button";
import { QueueTopButton } from "@/components/queue-top-button";
import { FeedFilters } from "@/components/feed-filters";
import { ScoreBadge, cardCls } from "@/components/ui";

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
  };
}

interface FeedParams {
  q?: string;
  ats?: string;
  minScore?: string;
  remote?: string;
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedParams> }) {
  const { q, ats, minScore, remote } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("job_matches")
    .select("score, reason, jobs!inner(id, title, company, location, apply_url, ats_type, posted_at)")
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    .limit(200);

  if (minScore) query = query.gte("score", Number(minScore));
  if (ats && ["greenhouse", "lever", "ashby", "workable"].includes(ats)) query = query.eq("jobs.ats_type", ats);
  if (remote === "1") query = query.ilike("jobs.location", "%remote%");
  if (q) {
    // Strip characters significant to PostgREST filter syntax so user input
    // can't break out of the ilike pattern and inject OR conditions.
    const safe = q.replace(/[,()*\\%:"]/g, "").slice(0, 80).trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,company.ilike.%${safe}%`, { referencedTable: "jobs" });
  }

  const [{ data: matchRows }, { data: appliedRows }, { data: profileRow }] = await Promise.all([
    query.overrideTypes<MatchRow[]>(),
    supabase.from("applications").select("job_id"),
    supabase.from("profiles").select("embedding").single<{ embedding: unknown }>(),
  ]);

  const applied = new Set((appliedRows ?? []).map((r) => r.job_id as string));
  // `q` filters the embedded jobs to null rows on non-matches with !inner; drop those.
  const matches = (matchRows ?? []).filter((m) => m.jobs && !applied.has(m.jobs.id)).slice(0, 50);
  const matchingPending = !profileRow?.embedding;
  const filtered = Boolean(q || ats || minScore || remote);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Job feed</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Ranked by fit with your profile. Queue the ones you want — nothing submits until you
            approve it.
          </p>
        </div>
        <QueueTopButton available={matches.length} />
      </div>

      {!matchingPending && <FeedFilters />}

      {matchingPending ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="font-mono text-sm text-accent">matching in progress…</p>
          <p className="mt-2 text-sm text-ink-soft">
            We&apos;re reading your profile against every open job. This takes about a minute after you
            save your <Link href="/profile" className="underline">profile</Link> and{" "}
            <Link href="/preferences" className="underline">preferences</Link> — refresh shortly.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm font-medium text-ink">
            {filtered ? "No matches for these filters" : "No unqueued matches right now"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {filtered
              ? "Try widening your search or clearing filters."
              : "You've queued everything that fits, or matching hasn't run since your last profile change. New jobs sync every 2 hours."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((m) => (
            <li key={m.jobs.id} className={`${cardCls} p-4 transition-colors hover:border-ink-soft/40`}>
              <div className="flex items-start gap-4">
                <ScoreBadge score={m.score} />
                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${m.jobs.id}`} className="block">
                    <h2 className="truncate text-sm font-semibold text-ink hover:text-accent">{m.jobs.title}</h2>
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {m.jobs.company}
                    {m.jobs.location ? ` · ${m.jobs.location}` : ""}{" "}
                    <span className="font-mono text-[11px] text-ink-soft/70">{m.jobs.ats_type}</span>
                  </p>
                  {m.reason && <p className="mt-1 text-sm text-ink-soft">{m.reason}</p>}
                  <Link
                    href={`/jobs/${m.jobs.id}`}
                    className="mt-1 inline-block text-xs text-ink-soft underline decoration-line hover:text-ink"
                  >
                    View details
                  </Link>
                </div>
                <QueueButton jobId={m.jobs.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
