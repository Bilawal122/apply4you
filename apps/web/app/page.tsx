import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SponsorBadge } from "@/components/ui";
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
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  return null; // stale beyond ~2 weeks isn't a selling point — say nothing rather than "3 weeks ago"
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
  const [{ data: heroJobs }, { count: openJobs }] = await Promise.all([
    admin
      .from("jobs")
      .select("id, title, company, location, ats_type, posted_at, sponsor_verdict")
      .is("closed_at", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(6)
      .overrideTypes<HeroJob[]>(),
    admin.from("jobs").select("id", { count: "exact", head: true }).is("closed_at", null),
  ]);
  const jobs = heroJobs ?? [];

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-sm font-bold tracking-tight text-ink">
            Apply<span className="text-accent">4</span>You
          </span>
          {signedIn ? (
            <div className="flex items-center gap-3">
              {email && <span className="hidden font-mono text-xs text-ink-soft sm:inline">{email}</span>}
              <Link
                href="/feed"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                Open your feed →
              </Link>
            </div>
          ) : (
            <Link href="/login" className="text-sm text-ink-soft hover:text-ink">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-16 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-widest text-accent">
            Auto-apply, review-gated
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            The applications write themselves. You just say go.
          </h1>
          <p className="mt-4 max-w-md text-ink-soft">
            Upload your resume once. We find jobs that fit, fill every application from your real
            experience — never invented — and submit the ones you approve. Up to 50 a day.
          </p>
          <div className="mt-8 flex items-center gap-3">
            {signedIn ? (
              <>
                <Link
                  href="/feed"
                  className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                >
                  Go to your job feed
                </Link>
                <Link
                  href="/applications"
                  className="rounded-md border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink hover:border-ink-soft"
                >
                  Review applications
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                >
                  Start free — 10 applications
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink hover:border-ink-soft"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
          <ul className="mt-10 flex flex-col gap-2 text-sm text-ink-soft">
            <li className="flex items-baseline gap-2">
              <span className="font-mono text-accent">✓</span> Nothing submits without your approval
            </li>
            <li className="flex items-baseline gap-2">
              <span className="font-mono text-accent">✓</span> Answers come only from your profile — gaps are
              flagged, never faked
            </li>
            <li className="flex items-baseline gap-2">
              <span className="font-mono text-accent">✓</span> Every submitted answer is saved, exportable, deletable
            </li>
          </ul>
        </div>

        <div className="hidden lg:block">
          <div className="rounded-lg border border-line bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
              <p className="text-sm font-semibold text-ink">Live in our index right now</p>
              {typeof openJobs === "number" && (
                <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">
                  {openJobs.toLocaleString()} open jobs
                </span>
              )}
            </div>
            {jobs.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-start justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{j.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
                        <span>
                          {j.company}
                          {j.location ? ` · ${j.location}` : ""}
                        </span>
                        <SponsorBadge verdict={j.sponsor_verdict} />
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-ink-soft/70">
                      {postedAgo(j.posted_at) ?? j.ats_type}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink-soft">Syncing job boards — check back shortly.</p>
            )}
          </div>
          <p className="mt-3 text-center font-mono text-[11px] text-ink-soft">
            real openings, synced every 2 hours — sign up and we score them against your profile
          </p>
        </div>
      </section>

      <footer className="border-t border-line bg-card py-4">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4">
          <p className="text-center font-mono text-[11px] text-ink-soft">
            sources: Greenhouse · Lever · Ashby · Workable — no LinkedIn or Indeed credentials, ever
          </p>
          <div className="flex gap-4 text-xs text-ink-soft">
            <Link href="/privacy" className="underline hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="underline hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
