import Link from "next/link";
import type { Field, ResolvedValues, UnresolvedField } from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { ApplicationReview, type ReviewApp } from "@/components/application-review";
import { ApproveAllButton } from "@/components/approve-all-button";
import { LiveFeed } from "@/components/live-feed";
import { StatusBadge } from "@/components/ui";

interface AppRow {
  id: string;
  status: string;
  form_schema: Field[] | null;
  resolved_fields: ResolvedValues;
  cover_letter: string | null;
  unresolved_fields: UnresolvedField[];
  created_at: string;
  submitted_at: string | null;
  failure_reason: string | null;
  jobs: { title: string; company: string; apply_url: string };
}

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: pendingRows }, { data: recentRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, status, form_schema, resolved_fields, cover_letter, unresolved_fields, created_at, submitted_at, failure_reason, jobs!inner(title, company, apply_url)",
      )
      .in("status", ["draft", "needs_review"])
      .order("created_at", { ascending: true })
      .overrideTypes<AppRow[]>(),
    supabase
      .from("applications")
      .select(
        "id, status, form_schema, resolved_fields, cover_letter, unresolved_fields, created_at, submitted_at, failure_reason, jobs!inner(title, company, apply_url)",
      )
      .in("status", ["approved", "submitting", "submitted", "failed", "skipped"])
      .order("created_at", { ascending: false })
      .limit(25)
      .overrideTypes<AppRow[]>(),
    supabase
      .from("application_events")
      .select("id, application_id, status, message, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const pending = pendingRows ?? [];
  const recent = recentRows ?? [];
  const draftCount = pending.filter((a) => a.status === "draft").length;

  const toReviewApp = (row: AppRow): ReviewApp => ({
    id: row.id,
    status: row.status,
    jobTitle: row.jobs.title,
    company: row.jobs.company,
    applyUrl: row.jobs.apply_url,
    formSchema: row.form_schema ?? [],
    resolvedFields: row.resolved_fields ?? {},
    coverLetter: row.cover_letter,
    unresolvedFields: row.unresolved_fields ?? [],
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Applications</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Review what the AI filled in, fix anything, then approve. Nothing is submitted without your
            approval.
          </p>
        </div>
        <ApproveAllButton draftCount={draftCount} />
      </div>

      {user && <LiveFeed initialEvents={eventRows ?? []} userId={user.id} />}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Waiting for review <span className="font-mono text-ink-soft">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nothing to review. Queue jobs from the <Link href="/feed" className="underline">feed</Link>.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((row) => (
              <ApplicationReview key={row.id} app={toReviewApp(row)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-soft">No submissions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{row.jobs.title}</span>
                  <span className="text-ink-soft"> · {row.jobs.company}</span>
                  {row.status === "failed" && row.failure_reason && (
                    <span className="ml-2 text-xs text-danger">
                      {row.failure_reason.slice(0, 80)} —{" "}
                      <a href={row.jobs.apply_url} target="_blank" rel="noreferrer" className="underline">
                        apply manually
                      </a>
                    </span>
                  )}
                </span>
                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
