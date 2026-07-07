import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QueueButton } from "@/components/queue-button";

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

  const { data: matches } = await supabase
    .from("job_matches")
    .select("score, reason, jobs!inner(id, title, company, location, apply_url, ats_type, posted_at)")
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    .limit(50)
    .overrideTypes<MatchRow[]>();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Job feed</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ranked by fit with your profile. Queue the ones you want — the AI fills them out and waits
          for your approval before anything is submitted.
        </p>
      </div>

      {!matches?.length ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No matches yet. Make sure your <Link href="/profile" className="underline">profile</Link> and{" "}
          <Link href="/preferences" className="underline">preferences</Link> are saved — matching runs
          within a few minutes of saving.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <li key={m.jobs.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-semibold text-white">
                      {m.score}
                    </span>
                    <h2 className="truncate text-sm font-semibold">{m.jobs.title}</h2>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    {m.jobs.company}
                    {m.jobs.location ? ` · ${m.jobs.location}` : ""} ·{" "}
                    <span className="uppercase text-xs text-neutral-400">{m.jobs.ats_type}</span>
                  </p>
                  {m.reason && <p className="mt-1 text-sm text-neutral-500">{m.reason}</p>}
                  <a
                    href={m.jobs.apply_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-neutral-400 underline"
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
