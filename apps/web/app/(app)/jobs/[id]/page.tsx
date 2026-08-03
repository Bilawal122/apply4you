import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueueButton } from "@/components/queue-button";
import { ScoreBadge, SponsorBadge, StatusBadge, cardCls } from "@/components/ui";
import { REGISTER_URL, type SponsorVerdict } from "@/lib/sponsors";

interface JobDetail {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  apply_url: string;
  ats_type: string;
  posted_at: string | null;
  closed_at: string | null;
  sponsor_verdict: SponsorVerdict | null;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job }, { data: match }, { data: application }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, company, location, description, apply_url, ats_type, posted_at, closed_at, sponsor_verdict")
      .eq("id", id)
      .single<JobDetail>(),
    supabase.from("job_matches").select("score, reason").eq("job_id", id).maybeSingle<{ score: number; reason: string | null }>(),
    supabase.from("applications").select("id, status").eq("job_id", id).maybeSingle<{ id: string; status: string }>(),
  ]);

  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/feed" className="text-sm text-ink-soft underline hover:text-ink">
        ← Back to feed
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink">{job.title}</h1>
          <p className="mt-1 text-ink-soft">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}{" "}
            <span className="font-mono text-xs text-ink-soft/70">{job.ats_type}</span>
          </p>
          {job.posted_at && (
            <p className="mt-0.5 font-mono text-xs text-ink-soft/70">
              posted {new Date(job.posted_at).toLocaleDateString()}
            </p>
          )}
          <div className="mt-1.5">
            <SponsorBadge verdict={job.sponsor_verdict} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {match && <ScoreBadge score={match.score} />}
          {job.closed_at ? (
            <span className="font-mono text-xs text-ink-soft">closed</span>
          ) : application ? (
            <Link href="/applications" className="flex items-center gap-1.5">
              <StatusBadge status={application.status} />
            </Link>
          ) : (
            <QueueButton jobId={job.id} />
          )}
        </div>
      </div>

      {match?.reason && (
        <div className={`${cardCls} mt-4 border-accent/30 bg-accent-soft/40 p-3`}>
          <p className="text-sm text-ink">
            <span className="font-mono text-xs uppercase text-accent">why this matches</span> — {match.reason}
          </p>
        </div>
      )}

      {job.sponsor_verdict?.licensed ? (
        <div className={`${cardCls} mt-4 p-3`}>
          <p className="text-sm text-ink">
            <span className="font-mono text-xs uppercase text-accent">visa sponsorship</span> —{" "}
            <span className="font-medium">{job.sponsor_verdict.org_name}</span> holds a Home Office
            sponsor licence{job.sponsor_verdict.ratings?.length ? ` (${job.sponsor_verdict.ratings.join(", ")})` : ""}
            {job.sponsor_verdict.routes?.length ? ` for: ${job.sponsor_verdict.routes.join(" · ")}` : ""}.
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Register of licensed sponsors as of {job.sponsor_verdict.register_date} (
            <a href={REGISTER_URL} target="_blank" rel="noreferrer" className="underline">
              gov.uk
            </a>
            ). A licence means the employer <em>can</em> sponsor — it does not guarantee sponsorship
            for this specific role; confirm with the employer.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-soft/80">
          No Home Office sponsor licence matched for &ldquo;{job.company}&rdquo; — this can also be a
          company-name mismatch with the register (legal entity names differ).{" "}
          <a href={REGISTER_URL} target="_blank" rel="noreferrer" className="underline">
            Check the register on gov.uk
          </a>{" "}
          if sponsorship matters for you.
        </p>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Job description</h2>
        {job.description ? (
          <div className={`${cardCls} whitespace-pre-wrap p-4 text-sm leading-relaxed text-ink-soft`}>
            {job.description}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            No description on file.{" "}
            <a href={job.apply_url} target="_blank" rel="noreferrer" className="underline">
              View the original posting
            </a>
            .
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <a
          href={job.apply_url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-ink-soft underline hover:text-ink"
        >
          View original posting ↗
        </a>
      </div>
    </div>
  );
}
