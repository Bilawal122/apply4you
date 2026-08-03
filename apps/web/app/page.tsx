import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SponsorBadge, Provenance, btnPrimary, btnSecondary } from "@/components/ui";
import type { SponsorVerdict } from "@/lib/sponsors";

interface HeroJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  ats_type: string;
  posted_at: string | null;
  sponsor_verdict: SponsorVerdict | null;
}

function postedAgo(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  return null; // stale beyond ~2 weeks isn't a selling point — say nothing rather than "3 weeks ago"
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * States the index's real edition date, the way /check states the register's.
 * This used to read "resynced every 2h" unconditionally — which was a claim
 * about the worker's schedule, not about the data, and went false the moment
 * sourcing paused. A page whose entire argument is "we never overstate" cannot
 * be the one thing on the site that does.
 */
function syncedLabel(lastPoll: string | null): string {
  if (!lastPoll) return "sync pending";
  const d = new Date(lastPoll);
  const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (hours < 1) return "synced just now";
  if (hours < 24) return `synced ${hours}h ago`;
  return `synced ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default async function LandingPage() {
  // Session-aware: a signed-in visitor should be recognized, not shown a
  // stranger's marketing page.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  // `jobs` RLS is authenticated-only, so a logged-out visitor needs the admin
  // client to see real openings here — same pattern as /check's live-jobs
  // count. Real listings, not a mockup: what's shown is whatever's actually
  // open right now.
  const admin = createAdminClient();
  const [{ data: heroJobs }, { count: openJobs }, { data: pollRow }] = await Promise.all([
    admin
      .from("jobs")
      .select("id, title, company, location, ats_type, posted_at, sponsor_verdict")
      .is("closed_at", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(7)
      .overrideTypes<HeroJob[]>(),
    admin.from("jobs").select("id", { count: "exact", head: true }).is("closed_at", null),
    admin
      .from("board_sources")
      .select("last_polled_at")
      .not("last_polled_at", "is", null)
      .order("last_polled_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ last_polled_at: string }>(),
  ]);
  const jobs = heroJobs ?? [];
  const synced = syncedLabel(pollRow?.last_polled_at ?? null);

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Apply<span className="text-accent">4</span>You
          </span>
          {signedIn ? (
            <div className="flex items-center gap-4">
              {email && <span className="hidden font-mono text-xs text-ink-faint sm:inline">{email}</span>}
              <Link href="/feed" className={btnPrimary}>
                Open your feed
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <Link href="/check" className="text-sm text-ink-soft transition-colors hover:text-ink">
                Sponsor checker
              </Link>
              <Link href="/login" className="text-sm text-ink-soft transition-colors hover:text-ink">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-14 px-5 py-16 lg:grid-cols-[1fr_minmax(0,26rem)] lg:py-24">
        <div className="min-w-0 max-w-xl">
          <p className="label-mono text-accent">Review-gated auto-apply</p>
          <h1 className="display mt-5 text-[2.75rem] text-ink sm:text-[3.5rem]">
            The applications write themselves. You just say go.
          </h1>
          <p className="mt-6 text-ink-soft">
            Upload your CV once. We watch hundreds of company job boards, score every opening against
            you, and fill each application from your real experience. You approve every single one
            before it&apos;s sent.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <>
                <Link href="/feed" className={btnPrimary}>
                  Go to your job feed
                </Link>
                <Link href="/applications" className={btnSecondary}>
                  Review applications
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" className={btnPrimary}>
                  Start free — 10 applications
                </Link>
                <Link href="/check" className={btnSecondary}>
                  Check a visa sponsor
                </Link>
              </>
            )}
          </div>

          {/*
            The differentiator, stated as a key rather than a demo: we can't
            show a filled application without inventing a person, and inventing
            one would contradict the exact promise being made. A legend is
            honest — it explains the system instead of performing it.
          */}
          <div className="mt-14 border-t border-line pt-6">
            <p className="label-mono">How to read a filled application</p>
            <dl className="mt-4 flex flex-col">
              {(
                [
                  ["profile", "Taken from the profile you reviewed and approved. Not invented."],
                  ["ai", "Written by the AI, grounded only in your profile. Always editable."],
                  ["you", "Your own answer, kept for the next form that asks the same thing."],
                  ["unknown", "No profile-backed answer existed. We flag it. We never guess."],
                ] as const
              ).map(([source, copy]) => (
                <div
                  key={source}
                  className="field-rule grid grid-cols-1 gap-x-6 gap-y-0.5 py-2.5 sm:grid-cols-[10rem_1fr]"
                >
                  <dt className="pt-px">
                    <Provenance source={source} />
                  </dt>
                  <dd className="text-sm text-ink-soft">{copy}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* The register extract: real rows, live counts, no mockup. */}
        <div className="min-w-0 lg:sticky lg:top-10">
          <div className="rounded-[3px] border border-line bg-card">
            <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
              <p className="label-mono text-ink-soft">Open positions</p>
              {typeof openJobs === "number" && (
                <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {openJobs.toLocaleString()}
                </p>
              )}
            </div>

            {jobs.length > 0 ? (
              <ul className="px-4">
                {jobs.map((j) => (
                  <li
                    key={j.id}
                    className="field-rule flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-snug text-ink">{j.title}</p>
                      <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                        {j.company}
                        {j.location ? ` · ${j.location}` : ""}
                      </p>
                      {j.sponsor_verdict?.licensed && (
                        <span className="mt-1.5 inline-block">
                          <SponsorBadge verdict={j.sponsor_verdict} />
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                      {postedAgo(j.posted_at) ?? j.ats_type}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-ink-soft">
                Syncing job boards — check back shortly.
              </p>
            )}

            <p className="border-t border-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              From the index · {synced}
            </p>
          </div>

          <p className="mt-3 px-1 text-[13px] text-ink-soft">
            Real openings from real company job boards — not a mockup. Sign up and every one of them
            gets scored against your profile.
          </p>
        </div>
      </section>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
            Greenhouse · Lever · Ashby · Workable — never LinkedIn or Indeed credentials
          </p>
          <div className="flex gap-5 text-[13px] text-ink-soft">
            <Link href="/check" className="transition-colors hover:text-ink">
              Sponsor checker
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
