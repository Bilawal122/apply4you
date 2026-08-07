import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueueButton } from "@/components/queue-button";
import {
  Chip,
  Eyebrow,
  ScoreDial,
  SponsorBadge,
  StatusBadge,
  btnLink,
  cardCls,
} from "@/components/ui";
import { REGISTER_URL, type SponsorVerdict } from "@/lib/sponsors";
import { formatSalary, salaryExtras } from "@/lib/salary";

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
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_summary: string | null;
  sponsor_verdict: SponsorVerdict | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Posted date in UTC, so the string a server renders never depends on the box. */
function postedLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const d = new Date(postedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The company's initial, on the dark tile. The only "logo" we honestly have. */
function monogramOf(company: string): string {
  return company.trim().charAt(0).toUpperCase() || "·";
}

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

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job }, { data: match }, { data: application }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, company, location, description, apply_url, ats_type, posted_at, closed_at, sponsor_verdict, salary_min, salary_max, salary_currency, salary_period, salary_summary")
      .eq("id", id)
      .single<JobDetail>(),
    supabase.from("job_matches").select("score, reason").eq("job_id", id).maybeSingle<{ score: number; reason: string | null }>(),
    supabase.from("applications").select("id, status").eq("job_id", id).maybeSingle<{ id: string; status: string }>(),
  ]);

  if (!job) notFound();

  const salary = formatSalary(job);
  const extras = salaryExtras(job);
  const posted = postedLabel(job.posted_at);

  return (
    <div>
      <Link
        href="/feed"
        className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <BackArrow />
        Back to the feed
      </Link>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={`${cardCls} min-w-0 px-5 py-6 sm:px-8 sm:py-7`}>
          <div className="flex items-start gap-4 sm:gap-5">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-slate text-[22px] font-extrabold tracking-[-0.03em] text-lime"
            >
              {monogramOf(job.company)}
            </span>

            <div className="min-w-0">
              <h1 className="display text-[26px] break-words text-ink sm:text-[32px]">{job.title}</h1>

              {/* company · location · salary · posted. The pay figure is the
                  employer's own or nothing at all — never an estimate. */}
              <p className="mt-2.5 text-[15px] leading-[1.55] text-ink-soft">
                {job.company}
                {job.location ? ` · ${job.location}` : ""} ·{" "}
                {salary ? (
                  <span className="font-mono text-[13.5px] text-ink-body">{salary}</span>
                ) : (
                  <span className="font-mono text-[13.5px] text-ink-faint">salary not stated</span>
                )}
                {extras ? ` · ${extras}` : ""}
                {posted && (
                  <>
                    {" · "}
                    <span className="font-mono text-[13.5px]">posted {posted}</span>
                  </>
                )}
              </p>

              {/*
                Pay provenance, kept from the old page. Greenhouse and Workable
                expose no compensation field at all, so "not stated" is the
                honest majority case and stays a statement, not a blank.
              */}
              <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-faint">
                {salary
                  ? "Published by the employer on the job posting."
                  : "Not stated by the employer. We don’t estimate one."}
              </p>
            </div>
          </div>

          {/*
            Fact chips — only what this row actually holds. The design also shows
            a question count and a cover-letter requirement; both live on the
            application's form_schema, which is only scraped once a job is
            queued, so this page has no such data and invents none.
          */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <SponsorBadge verdict={job.sponsor_verdict} />
            <Chip>{job.ats_type}</Chip>
            {job.closed_at && (
              <span className="inline-flex shrink-0 items-center rounded-md bg-danger-soft px-2.5 py-1.5 font-mono text-[11.5px] leading-none text-danger">
                posting closed
              </span>
            )}
          </div>

          <hr className="mt-6 border-0 border-t border-line-soft" />

          <h2 className="label-mono mt-6">Job description</h2>
          {job.description ? (
            <div className="mt-3 break-words whitespace-pre-wrap text-[16px] leading-[1.65] text-ink-body">
              {job.description}
            </div>
          ) : (
            <p className="mt-3 text-[15px] leading-[1.6] text-ink-body">
              No description on file.{" "}
              <a
                href={job.apply_url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line underline-offset-2 hover:text-ink"
              >
                View the original posting
              </a>
              .
            </p>
          )}

          <div className="mt-7 border-t border-line-soft pt-5">
            <a
              href={job.apply_url}
              target="_blank"
              rel="noreferrer"
              className="text-[13.5px] text-ink-soft underline decoration-line underline-offset-2 transition-colors hover:text-ink"
            >
              View original posting ↗
            </a>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <div className={`${cardCls} px-6 py-6`}>
            {match ? (
              <>
                <div className="flex items-center gap-4">
                  <ScoreDial score={match.score} />
                  <div className="min-w-0">
                    <p className="label-mono">fit score</p>
                    <p className="mt-1.5 text-[14px] leading-[1.45] text-ink-body">
                      out of 100, scored against your profile
                    </p>
                  </div>
                </div>
                {match.reason && (
                  <p className="mt-4 text-[14.5px] leading-[1.6] text-ink-body">
                    <span className="label-mono">why</span> {match.reason}
                  </p>
                )}
              </>
            ) : (
              <>
                <Eyebrow>Not scored</Eyebrow>
                <p className="mt-2.5 text-[14.5px] leading-[1.6] text-ink-body">
                  This role isn&apos;t in your matches, so there is no fit score to show for it.
                </p>
              </>
            )}

            {/*
              The design puts a "we can fill n of m answers" sentence here. The
              form is only read when an application is queued, so on this page
              that number does not exist yet and is not guessed at.
            */}
            <div className="mt-5 border-t border-line-soft pt-5">
              {job.closed_at ? (
                <p className="text-[14px] leading-[1.6] text-ink-body">
                  <span className="font-semibold text-danger">This posting has closed.</span> It is no
                  longer on the company&apos;s job board, so there is nothing left to fill.
                </p>
              ) : application ? (
                <Link
                  href="/applications"
                  className="inline-flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <StatusBadge status={application.status} />
                  <span className={btnLink}>In your applications</span>
                </Link>
              ) : (
                <div className="flex">
                  <QueueButton jobId={job.id} />
                </div>
              )}

              <p className="mt-3.5 font-mono text-[11.5px] leading-[1.5] text-ink-soft">
                nothing sends without your approval
              </p>
            </div>
          </div>

          <div className={`${cardCls} px-6 py-6`}>
            <Eyebrow>Visa sponsorship</Eyebrow>
            {job.sponsor_verdict?.licensed ? (
              <>
                <p className="mt-3 text-[14.5px] leading-[1.6] text-ink-body">
                  <span className="font-semibold text-ink">{job.sponsor_verdict.org_name}</span> holds a
                  Home Office sponsor licence
                  {job.sponsor_verdict.ratings?.length ? ` (${job.sponsor_verdict.ratings.join(", ")})` : ""}
                  {job.sponsor_verdict.routes?.length ? ` for: ${job.sponsor_verdict.routes.join(" · ")}` : ""}.
                </p>
                {/*
                  D5 wording, preserved verbatim: a licence is permission, never a
                  promise, and the register date it was read on travels with it.
                */}
                <p className="mt-4 border-t border-line-soft pt-4 text-[13px] leading-[1.55] text-ink-soft">
                  Register of licensed sponsors as of{" "}
                  <span className="font-mono">{job.sponsor_verdict.register_date}</span> (
                  <a
                    href={REGISTER_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-line underline-offset-2 hover:text-ink"
                  >
                    gov.uk
                  </a>
                  ). A licence means the employer <em>can</em> sponsor — it does not guarantee
                  sponsorship for this specific role; confirm with the employer.
                </p>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-[1.55] text-ink-soft">
                No Home Office sponsor licence matched for &ldquo;{job.company}&rdquo; — this can also be
                a company-name mismatch with the register (legal entity names differ).{" "}
                <a
                  href={REGISTER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line underline-offset-2 hover:text-ink"
                >
                  Check the register on gov.uk
                </a>{" "}
                if sponsorship matters for you.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
