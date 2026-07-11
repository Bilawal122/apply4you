import Link from "next/link";
import { notFound } from "next/navigation";
import type { Field, ResolvedValues } from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge, cardCls } from "@/components/ui";

interface AppDetail {
  id: string;
  user_id: string;
  status: string;
  mode: string;
  form_schema: Field[] | null;
  resolved_fields: ResolvedValues;
  submitted_fields: ResolvedValues | null;
  cover_letter: string | null;
  failure_reason: string | null;
  created_at: string;
  submitted_at: string | null;
  jobs: { id: string; title: string; company: string; apply_url: string };
}

interface EventRow {
  id: number;
  status: string;
  message: string | null;
  created_at: string;
}

/** The fields actually sent (post-submit snapshot) or staged to send (pre-submit). */
function displayFields(app: AppDetail): Array<{ label: string; value: string }> {
  const values = app.submitted_fields ?? app.resolved_fields ?? {};
  const schema = app.form_schema ?? [];
  const labelById = new Map(schema.map((f) => [f.id, f.label]));
  return Object.entries(values)
    .filter(([id, v]) => v != null && v !== "" && !/cover.?letter/i.test(`${id} ${labelById.get(id) ?? ""}`))
    .map(([id, v]) => ({ label: labelById.get(id) ?? id, value: String(v) }));
}

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: app }, { data: events }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, user_id, status, mode, form_schema, resolved_fields, submitted_fields, cover_letter, failure_reason, created_at, submitted_at, jobs!inner(id, title, company, apply_url)",
      )
      .eq("id", id)
      .single<AppDetail>(),
    supabase
      .from("application_events")
      .select("id, status, message, created_at")
      .eq("application_id", id)
      .order("created_at", { ascending: true })
      .overrideTypes<EventRow[]>(),
  ]);

  if (!app) notFound();

  // Failure screenshots live in the private artifacts bucket — sign a short URL
  // via the service role after the session/ownership check above (RLS on the
  // applications select guarantees this row belongs to the caller).
  let screenshotUrl: string | null = null;
  if (app.status === "failed") {
    const { data: signed } = await createAdminClient()
      .storage.from("artifacts")
      .createSignedUrl(`failures/${app.id}.png`, 600);
    screenshotUrl = signed?.signedUrl ?? null;
  }

  const fields = displayFields(app);
  const snapshotTitle = app.submitted_fields ? "Submitted answers" : "Filled answers (not yet submitted)";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/applications" className="text-sm text-ink-soft underline hover:text-ink">
        ← Back to applications
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{app.jobs.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{app.jobs.company}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {app.status === "failed" && app.failure_reason && (
        <div className={`${cardCls} mt-4 border-danger/30 bg-danger-soft/50 p-3`}>
          <p className="text-sm text-danger">{app.failure_reason}</p>
          <a href={app.jobs.apply_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">
            Apply manually on the original posting ↗
          </a>
          {screenshotUrl && (
            <a
              href={screenshotUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-3 mt-1 inline-block text-xs text-ink-soft underline"
            >
              View failure screenshot
            </a>
          )}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">{snapshotTitle}</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-ink-soft">No field values recorded.</p>
        ) : (
          <dl className={`${cardCls} divide-y divide-line`}>
            {fields.map((f, i) => (
              <div key={i} className="grid grid-cols-3 gap-3 p-3">
                <dt className="text-xs text-ink-soft">{f.label}</dt>
                <dd className="col-span-2 font-mono text-xs text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {app.cover_letter && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Cover letter</h2>
          <div className={`${cardCls} whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-ink-soft`}>
            {app.cover_letter}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">History</h2>
        <ul className="flex flex-col gap-1.5">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft/70">
                {new Date(e.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="shrink-0 font-mono text-[11px] font-medium lowercase text-ink-soft">
                {e.status.replace("_", " ")}
              </span>
              <span className="text-ink-soft">{e.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
