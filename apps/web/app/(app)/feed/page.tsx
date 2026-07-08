import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QueueButton } from "@/components/queue-button";
import { QueueTopButton } from "@/components/queue-top-button";
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

export default async function FeedPage() {
  const supabase = await createClient();

  const [{ data: matchRows }, { data: appliedRows }, { data: profileRow }] = await Promise.all([
    supabase
      .from("job_matches")
      .select("score, reason, jobs!inner(id, title, company, location, apply_url, ats_type, posted_at)")
      .is("jobs.closed_at", null)
      .order("score", { ascending: false })
      .limit(80)
      .overrideTypes<MatchRow[]>(),
    supabase.from("applications").select("job_id"),
    supabase.from("profiles").select("embedding").single<{ embedding: unknown }>(),
  ]);

  const applied = new Set((appliedRows ?? []).map((r) => r.job_id as string));
  const matches = (matchRows ?? []).filter((m) => !applied.has(m.jobs.id)).slice(0, 50);
  const matchingPending = !profileRow?.embedding;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Job feed</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Ranked by fit with your profile. Queue the ones you want — nothing submits until you
            approve it.
          </p>
        </div>
        <QueueTopButton available={matches.length} />
      </div>

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
          <p className="text-sm font-medium text-ink">No unqueued matches right now</p>
          <p className="mt-2 text-sm text-ink-soft">
            You&apos;ve queued everything that fits, or matching hasn&apos;t run since your last profile
            change. New jobs sync every 2 hours.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((m) => (
            <li key={m.jobs.id} className={`${cardCls} p-4 transition-colors hover:border-ink-soft/40`}>
              <div className="flex items-start gap-4">
                <ScoreBadge score={m.score} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-ink">{m.jobs.title}</h2>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {m.jobs.company}
                    {m.jobs.location ? ` · ${m.jobs.location}` : ""}{" "}
                    <span className="font-mono text-[11px] text-ink-soft/70">{m.jobs.ats_type}</span>
                  </p>
                  {m.reason && <p className="mt-1 text-sm text-ink-soft">{m.reason}</p>}
                  <a
                    href={m.jobs.apply_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-ink-soft underline decoration-line hover:text-ink"
                  >
                    View posting
                  </a>
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
