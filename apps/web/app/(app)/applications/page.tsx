import Link from "next/link";
import {
  TailoredCvSchema,
  resolveTailoredCv,
  type Field,
  type ResolvedValues,
  type UnresolvedField,
} from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { rowToProfile, type ProfileRow } from "@/lib/profile";
import { ApplicationReview, type ReviewApp } from "@/components/application-review";
import { ApproveAllButton } from "@/components/approve-all-button";
import { LiveFeed } from "@/components/live-feed";
import { StatusBadge, cardCls } from "@/components/ui";

const SELECT_COLS =
  "id, status, form_schema, resolved_fields, cover_letter, tailored_cv, answer_sources, unresolved_fields, created_at, submitted_at, failure_reason, jobs!inner(title, company, apply_url, closed_at)";

interface AppRow {
  id: string;
  status: string;
  form_schema: Field[] | null;
  resolved_fields: ResolvedValues;
  cover_letter: string | null;
  tailored_cv: unknown;
  answer_sources: Record<string, string> | null;
  unresolved_fields: UnresolvedField[];
  created_at: string;
  submitted_at: string | null;
  failure_reason: string | null;
  jobs: { title: string; company: string; apply_url: string; closed_at: string | null };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The sent date, in UTC so the string a server renders never depends on where
 * the box is. Rows that were never sent (skipped, still queued) print a dash
 * rather than borrowing `created_at` — the column says "Sent", so an unsent row
 * has nothing to put in it.
 */
function sentOn(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const thisYear = new Date().getUTCFullYear();
  const year = d.getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year === thisYear ? "" : ` ${String(year).slice(2)}`}`;
}

/*
 * `answer_sources` is the server's own record of who wrote each answer, written
 * when the application was filled. It is the only provenance data this row has,
 * so the column shows exactly that tally and nothing more — a row that never
 * recorded any prints a dash rather than an invented zero.
 */
const SOURCE_SHORT: Record<string, string> = {
  profile: "profile",
  library: "saved",
  ai: "ai",
  you: "you",
};

function provenanceSummary(sources: Record<string, string> | null): string | null {
  const recorded = Object.values(sources ?? {});
  if (recorded.length === 0) return null;
  const counts = new Map<string, number>();
  for (const source of recorded) counts.set(source, (counts.get(source) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${n} ${SOURCE_SHORT[source] ?? source}`)
    .join(" · ");
}

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: pendingRows }, { data: recentRows }, { data: eventRows }, { data: profileRow }] =
    await Promise.all([
      supabase
        .from("applications")
        .select(SELECT_COLS)
        .in("status", ["draft", "needs_review"])
        .order("created_at", { ascending: true })
        .overrideTypes<AppRow[]>(),
      supabase
        .from("applications")
        .select(SELECT_COLS)
        .in("status", ["approved", "submitting", "submitted", "failed", "skipped", "needs_manual_verification"])
        .order("created_at", { ascending: false })
        .limit(25)
        .overrideTypes<AppRow[]>(),
      supabase
        .from("application_events")
        .select("id, application_id, status, message, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("profiles").select("*").single<ProfileRow>(),
    ]);

  // The tailored CV is stored as a SELECTION of profile indices, never as
  // rendered text — so it's resolved against the live profile here. Editing
  // your profile updates every pending packet for free, and a stored row can
  // never contain experience you didn't write.
  const profile = profileRow ? rowToProfile(profileRow) : null;
  const resolveCv = (raw: unknown): ReviewApp["tailoredCv"] => {
    if (!profile || !raw) return null;
    const parsed = TailoredCvSchema.safeParse(raw);
    return parsed.success ? resolveTailoredCv(profile, parsed.data) : null;
  };

  const pending = pendingRows ?? [];
  const recent = recentRows ?? [];
  // Matches what approveAllDrafts will actually act on, so the button
  // never promises more than it can send.
  const draftCount = pending.filter((a) => a.status === "draft" && a.jobs.closed_at === null).length;

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
    tailoredCv: resolveCv(row.tailored_cv),
    answerSources: row.answer_sources ?? {},
    jobClosed: row.jobs.closed_at !== null,
  });

  // The five columns, shared by the header row and every data row so they can
  // never drift apart. Below md the grid collapses and the header is hidden.
  const rowGrid = "md:grid md:grid-cols-[minmax(0,1fr)_130px_90px_140px_auto] md:items-center md:gap-5";

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-xl">
          {/*
            The headline counts the queue, which is the number the page can
            actually stand behind: the pending query is unbounded, while the
            list below it is capped at the most recent 25.
          */}
          <h1 className="display text-[30px] text-ink sm:text-[34px]">
            {pending.length > 0 ? `${pending.length} waiting for your approval` : "Nothing waiting for you"}
          </h1>
          <p className="mt-2.5 text-[15.5px] leading-[1.55] text-ink-soft">
            Nothing is submitted without your approval, and every application keeps a receipt: what was sent,
            when it went, and every status it passed through.
          </p>
        </div>
        <ApproveAllButton draftCount={draftCount} />
      </div>

      {user && <LiveFeed initialEvents={eventRows ?? []} userId={user.id} />}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="label-mono">Waiting for review</h2>
          <span className="font-mono text-[12.5px] tabular-nums text-ink-soft">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className={`${cardCls} px-6 py-6`}>
            <p className="text-[14.5px] leading-[1.6] text-ink-body">
              Nothing to review. Queue jobs from the{" "}
              <Link href="/feed" className="underline underline-offset-2 hover:text-ink">
                feed
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((row) => (
              <ApplicationReview key={row.id} app={toReviewApp(row)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="label-mono mb-3">Recent</h2>
        {recent.length === 0 ? (
          <div className={`${cardCls} px-6 py-6`}>
            <p className="text-[14.5px] leading-[1.6] text-ink-body">No submissions yet.</p>
          </div>
        ) : (
          <div className={`${cardCls} px-5 pb-4 pt-1 sm:px-7`}>
            <div
              className={`hidden py-3.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-soft ${rowGrid}`}
            >
              <span>Role</span>
              <span>Status</span>
              <span>Sent</span>
              <span>Provenance</span>
              <span className="sr-only">Receipt</span>
            </div>
            <ul>
              {recent.map((row) => {
                const sent = sentOn(row.submitted_at);
                const provenance = provenanceSummary(row.answer_sources);

                return (
                  <li key={row.id}>
                    <Link
                      href={`/applications/${row.id}`}
                      className={`flex flex-col gap-2.5 border-t border-line-soft py-3.5 transition-colors hover:bg-paper-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${rowGrid}`}
                    >
                      <span className="block min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-ink">
                          {row.jobs.title}
                        </span>
                        <span className="block truncate text-[13px] text-ink-soft">{row.jobs.company}</span>
                        {row.status === "failed" && row.failure_reason && (
                          <span className="mt-1 block text-[12.5px] leading-snug text-danger">
                            {row.failure_reason.slice(0, 60)}
                          </span>
                        )}
                      </span>

                      {/* On a phone these four sit on one wrapping line; from md
                          they become their own grid columns. */}
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-2 md:contents">
                        <span className="shrink-0">
                          <StatusBadge status={row.status} />
                        </span>
                        <span
                          className="font-mono text-[12.5px] tabular-nums text-ink-soft"
                          title={sent ? "Submitted (UTC)" : "Not submitted"}
                        >
                          {sent ?? <span className="text-ink-faint">—</span>}
                        </span>
                        <span
                          className="truncate font-mono text-[12.5px] text-ink-soft"
                          title={
                            provenance
                              ? "Where each answer came from, as recorded when this application was filled"
                              : "No sources were recorded for this application"
                          }
                        >
                          {provenance ?? <span className="text-ink-faint">—</span>}
                        </span>
                        <span className="text-[13.5px] font-semibold text-ink underline underline-offset-2 md:justify-self-end">
                          Receipt
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
