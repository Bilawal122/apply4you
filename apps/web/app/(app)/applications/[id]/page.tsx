import Link from "next/link";
import { notFound } from "next/navigation";
import type { Field, ResolvedValues } from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Eyebrow, StatusBadge, cardCls, cardDarkCls, insetCls } from "@/components/ui";

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

/** The back chevron, drawn to match the one at the top of a job's page. */
function BackArrow() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 2.25 3.75 6l3.75 3.75" />
    </svg>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A date on the receipt, in UTC — the same rule the applications list follows,
 * so the string a server renders never depends on where the box is. The year is
 * always printed here: a receipt is read long after the fact.
 */
function receiptDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The fields actually sent (post-submit snapshot) or staged to send (pre-submit). */
function displayFields(app: AppDetail): Array<{ id: string; label: string; value: string }> {
  const values = app.submitted_fields ?? app.resolved_fields ?? {};
  const schema = app.form_schema ?? [];
  const labelById = new Map(schema.map((f) => [f.id, f.label]));
  return Object.entries(values)
    .filter(([id, v]) => v != null && v !== "" && !/cover.?letter/i.test(`${id} ${labelById.get(id) ?? ""}`))
    .map(([id, v]) => ({ id, label: labelById.get(id) ?? id, value: String(v) }));
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
  const timeline = events ?? [];

  const queuedOn = receiptDate(app.created_at);
  const sentOn = receiptDate(app.submitted_at);

  // The stamp is the machine's own verdict, printed as stored — not a friendlier
  // synonym for it.
  const stamp = app.status.replace(/_/g, " ");
  const stampTone =
    app.status === "submitted"
      ? "text-lime"
      : app.status === "failed" || app.status === "needs_manual_verification"
        ? "text-attention-bright"
        : "text-on-slate";

  /*
   * "Approved by — you" is a fact this page can check, not a flourish: `approved`
   * is only ever written by the approve action, and the submit worker refuses any
   * row that is not already `approved`. So a logged approval event — or a status
   * that can only be reached through one — is the whole evidence for the line.
   */
  const approvedByYou =
    timeline.some((e) => e.status === "approved") ||
    ["approved", "submitting", "submitted"].includes(app.status);
  const approval = approvedByYou
    ? { label: "Approved by", value: "you", tone: "text-on-slate" }
    : app.status === "skipped"
      ? { label: "Skipped by", value: "you", tone: "text-on-slate" }
      : { label: "Approved by", value: "not yet", tone: "text-on-slate-faint" };

  /*
   * The chit's register. Every line is read straight off this row — a count of
   * the answers listed beside it, whether a letter went with them, and the two
   * dates the row actually stores.
   */
  const receiptRows: Array<{ label: string; value: string }> = [
    { label: app.submitted_fields ? "Answers sent" : "Answers staged", value: String(fields.length) },
    { label: "Cover letter", value: app.cover_letter ? "included" : "none" },
  ];
  if (queuedOn) receiptRows.push({ label: "Queued", value: queuedOn });
  receiptRows.push({ label: "Sent", value: sentOn ?? "not sent" });

  return (
    <div>
      <Link
        href="/applications"
        className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <BackArrow />
        Back to applications
      </Link>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={`${cardCls} min-w-0 px-5 py-6 sm:px-8 sm:py-7`}>
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
            <div className="min-w-0">
              <Eyebrow>Application receipt</Eyebrow>
              <h1 className="display mt-3 text-[26px] break-words text-ink sm:text-[32px]">
                {app.jobs.title}
              </h1>
              {/*
                The design's subline runs company · location · ats. Location and
                the ATS name live on the job row this page has never selected, so
                the line carries what it really holds: the employer, and how many
                answers are listed below it.
              */}
              <p className="mt-2.5 text-[15px] leading-[1.55] text-ink-soft">
                {app.jobs.company} ·{" "}
                <span className="font-mono text-[13.5px] text-ink-body">
                  {fields.length} answer{fields.length === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            <StatusBadge status={app.status} />
          </div>

          {/*
            A failed submission is the one thing this page must never soften: the
            reason the machine gave, the link that lets the user finish the job by
            hand, and the screenshot of the form as the worker left it.
          */}
          {app.status === "failed" && app.failure_reason && (
            <div className="mt-6 rounded-xl bg-danger-soft px-4 py-4 sm:px-5">
              <Eyebrow className="text-danger">Submission failed</Eyebrow>
              <p className="mt-2.5 text-[14.5px] leading-[1.6] text-ink-body">{app.failure_reason}</p>
              <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <a
                  href={app.jobs.apply_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13.5px] font-semibold text-ink underline underline-offset-2 transition-colors hover:text-ink-soft"
                >
                  Apply manually on the original posting ↗
                </a>
                {screenshotUrl && (
                  <a
                    href={screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-ink-soft underline decoration-line underline-offset-2 transition-colors hover:text-ink"
                  >
                    View failure screenshot
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="mt-7">
            {/*
              Amber is the system's "still yours to do", so an application that
              has not gone yet says so in it. Once it is sent the same line is
              plain: there is nothing left for the reader to act on.
            */}
            <Eyebrow className={app.submitted_fields ? "" : "text-attention"}>{snapshotTitle}</Eyebrow>

            {fields.length === 0 ? (
              <p className="mt-3 text-[14.5px] leading-[1.6] text-ink-body">No field values recorded.</p>
            ) : (
              /*
                Every answer as a ruled register row: the employer's question in
                sans on the left, the value the machine filled in mono on the
                right. The design also prints a provenance label under each value.
                That record exists — applications.answer_sources, written at
                resolve time — but it is not on this page's query, and a visual
                port is not the place to change what a page fetches. So no source
                is claimed here rather than guessed at.
              */
              <dl className="mt-3 flex flex-col border-t border-line-soft">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="field-rule grid grid-cols-1 gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[minmax(9rem,15rem)_1fr]"
                  >
                    <dt className="text-[14.5px] leading-snug text-ink-soft">{f.label}</dt>
                    <dd className="min-w-0 font-mono text-[13.5px] leading-[1.6] break-words whitespace-pre-wrap text-ink">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {app.cover_letter && (
            <div className={`${insetCls} mt-6 px-4 py-4 sm:px-5`}>
              <Eyebrow>Cover letter</Eyebrow>
              <p className="mt-2.5 text-[14.5px] leading-[1.65] break-words whitespace-pre-wrap text-ink-body">
                {app.cover_letter}
              </p>
            </div>
          )}

          <div className="mt-7 border-t border-line-soft pt-5">
            <Eyebrow>History</Eyebrow>
            {timeline.length === 0 ? (
              <p className="mt-3 text-[14.5px] leading-[1.6] text-ink-body">No events recorded yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {timeline.map((e) => (
                  <li
                    key={e.id}
                    className="field-rule grid grid-cols-1 gap-x-5 gap-y-1 py-3 sm:grid-cols-[130px_130px_minmax(0,1fr)] sm:items-baseline"
                  >
                    <span className="font-mono text-[11.5px] tabular-nums text-ink-faint">
                      {new Date(e.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="font-mono text-[11.5px] font-medium lowercase text-ink-soft">
                      {e.status.replace("_", " ")}
                    </span>
                    <span className="text-[13.5px] leading-snug text-ink-body">{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/*
          The receipt chit: a stamp, a dashed rule, the register of what this
          application actually consists of, another dashed rule, and who approved
          it. The design's version of this panel tallies where each answer came
          from; those tallies are stored on applications.answer_sources, which
          this page has never read — so the chit counts what it really holds
          instead of inventing a breakdown. The applications list, which links
          here, still prints that tally for the same row.
        */}
        <aside className="flex min-w-0 flex-col gap-4">
          <div className={`${cardDarkCls} px-6 py-6`}>
            <p
              className={`text-center font-mono text-[12.5px] font-medium tracking-[0.2em] break-words uppercase ${stampTone}`}
            >
              {stamp}
            </p>
            {sentOn && (
              <p className="mt-2 text-center font-mono text-[11px] tabular-nums text-on-slate-faint">
                {sentOn}
              </p>
            )}

            <div className="my-5 border-t border-dashed border-slate-line" />

            <p className="font-mono text-[10.5px] font-medium tracking-[0.1em] text-on-slate-faint uppercase">
              {app.submitted_fields ? "What was sent" : "What is staged"}
            </p>
            <div className="mt-3.5 flex flex-col gap-2.5 font-mono text-[12.5px]">
              {receiptRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4">
                  <span className="text-on-slate-faint">{row.label}</span>
                  <span className="tabular-nums text-on-slate">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="my-5 border-t border-dashed border-slate-line" />

            <div
              className="flex items-baseline justify-between gap-4 font-mono text-[12.5px]"
              title="An application only leaves the queue once you approve it — nothing here was sent on your behalf."
            >
              <span className="text-on-slate-faint">{approval.label}</span>
              <span className={approval.tone}>{approval.value}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
