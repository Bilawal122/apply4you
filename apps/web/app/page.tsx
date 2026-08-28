import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Logo,
  SponsorBadge,
  Provenance,
  Eyebrow,
  Tick,
  NeedsYouStamp,
  btnPrimary,
  btnSecondary,
  cardCls,
  cardDarkCls,
  insetCls,
} from "@/components/ui";
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

/* ── Marks ─────────────────────────────────────────────────────────────── */

/** The three-circle mark. `tone` swaps the two solid dots for a dark panel. */
/** The hand-drawn ring behind the headline's operative phrase. */
function Scribble() {
  return (
    <svg
      viewBox="0 0 420 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute -left-[0.22em] -top-[0.18em] h-[calc(100%+0.36em)] w-[calc(100%+0.44em)]"
    >
      <path
        d="M18 66 C40 22 120 12 220 14 C330 16 404 34 400 60 C396 88 300 108 190 105 C88 102 18 88 25 59 C29 39 72 25 132 19"
        fill="none"
        stroke="var(--color-lime)"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <line x1="2" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10 4l5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Static copy ───────────────────────────────────────────────────────── */

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#safeguards", label: "Safeguards" },
  { href: "#pricing", label: "Pricing" },
  { href: "/check", label: "Sponsor checker" },
];

/**
 * The four sources an answer can have. This is the page's substitute for the
 * design's filled-application demo: we cannot show a filled form without
 * inventing a person, and inventing one would contradict the exact promise
 * being made. A legend explains the system instead of performing it.
 */
const PROVENANCE_LEGEND = [
  ["profile", "Taken from the profile you reviewed and approved. Not invented."],
  ["ai", "Written by the AI, grounded only in your profile. Always editable."],
  ["you", "Your own answer, kept for the next form that asks the same thing."],
  ["unknown", "No profile-backed answer existed. We flag it. We never guess."],
] as const;

/** Only the four boards the fill layer actually drives (0001_init.sql). */
const ATS = ["Greenhouse", "Lever", "Ashby", "Workable"];

const SAFEGUARDS = [
  {
    title: "A human approves every send",
    body: "Applications wait in a queue until you press approve. There is no switch in the product that turns that off, and no plan that comes without it.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="15" fill="var(--color-lime)" />
        <path
          d="M8.5 15.4l4.2 4.2 8.8-9.2"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Blanks, never guesses",
    body: "If your profile can’t back an answer, the field stays empty and comes to you flagged. We would rather hand you work than invent a fact in your name.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle
          cx="15"
          cy="15"
          r="14"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeDasharray="3.4 3"
        />
        <path d="M15 9v7.5" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="15" cy="20.6" r="1.4" fill="var(--color-ink)" />
      </svg>
    ),
  },
  {
    title: "We don’t touch LinkedIn",
    body: "Or any site whose terms forbid automation, and we never ask for those credentials. We fill the applicant tracking systems employers publish for exactly this purpose — nothing else.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="14" fill="none" stroke="var(--color-ink)" strokeWidth="2" />
        <line
          x1="6.5"
          y1="23.5"
          x2="23.5"
          y2="6.5"
          stroke="var(--color-attention)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Your data leaves when you do",
    body: "Delete your account and the CV, the profile and every receipt go with it, immediately and irreversibly. Nothing is sold, and nothing is used to train a model.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="5" y="9" width="20" height="16" rx="3" fill="none" stroke="var(--color-ink)" strokeWidth="2" />
        <path
          d="M10 9V6.5A5 5 0 0120 6.5V9"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="15" cy="17" r="2" fill="var(--color-lime)" />
      </svg>
    ),
  },
];

/*
 * The design had a sixth row here — "your time for ten applications, ~18
 * minutes vs ~4 hours". We have never measured either number, so it is gone.
 * Every row that survives is a description of behaviour the code actually has.
 */
const COMPARE: Array<[string, string, string, string]> = [
  ["Who approves each submission", "You do, one at a time", "Nobody", "You do"],
  [
    "Questions it can’t answer from your CV",
    "Left blank and flagged for you",
    "Filled with a guess",
    "You answer them",
  ],
  ["Where it applies", "Employer ATS only", "Anywhere, terms ignored", "Wherever you look"],
  ["Record of what was sent", "A receipt per application", "A counter", "Your memory"],
  ["When something fails", "Logged with a screenshot", "Counted as sent", "You find out later"],
];

const FAQ = [
  {
    q: "Will employers know a tool filled this in?",
    a: "There’s nothing to notice. The answers are your facts, submitted through the employer’s own form, approved by you. No tracking pixel, no branding, no note in the margin.",
  },
  {
    q: "What happens when a form asks something odd?",
    a: "It comes to you. Anything we can’t trace back to your profile is left blank, flagged, and waits in the queue. Answer it once and we reuse your wording from then on.",
  },
  {
    q: "Does it write a different cover letter each time?",
    a: "Yes — drafted from your profile against that specific posting, and labelled as drafted so you know to read it. Edit it or delete it before you approve.",
  },
  {
    q: "How does the sponsor licence check work?",
    a: "We match the employer against the Home Office register of licensed sponsors and show the register date we checked against. A licence means the employer may sponsor — never that a given role is sponsored. We flag it. We never promise it.",
  },
  {
    q: "Where does my CV go?",
    a: "Into your profile, used only to fill forms you approve. It is never sold, never shared with recruiters, and never used to train a model. Delete your account and it goes with it.",
  },
  {
    q: "Can I just watch it work first?",
    a: "That’s what the free ten are for. Upload your CV, look at what we filled, and close the tab if it isn’t right. Nothing has been sent.",
  },
];

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

  // The register edition we actually matched against, taken from a verdict we
  // already fetched. If no row carries one, the page says nothing about dates.
  const registerDate =
    jobs.find((j) => j.sponsor_verdict?.licensed && j.sponsor_verdict?.register_date)?.sponsor_verdict
      ?.register_date ?? null;

  const primaryCta = signedIn ? (
    <Link href="/feed" className={btnPrimary}>
      Go to your job feed
      <Arrow />
    </Link>
  ) : (
    <Link href="/signup" className={btnPrimary}>
      Upload my CV
      <Arrow />
    </Link>
  );

  const secondaryCta = signedIn ? (
    <Link href="/applications" className={btnSecondary}>
      Review applications
    </Link>
  ) : (
    <Link href="/check" className={btnSecondary}>
      Check a visa sponsor
    </Link>
  );

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      {/* ── top bar ──────────────────────────────────────────────────── */}
      <header>
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 text-[18px] font-extrabold tracking-[-0.03em] text-ink"
          >
            <Logo />
            apply4you
          </Link>

          <nav className="hidden items-center gap-8 text-[15px] font-medium lg:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-ink transition-colors hover:text-ink-soft">
                {item.label}
              </Link>
            ))}
          </nav>

          {signedIn ? (
            <div className="flex items-center gap-4">
              {email && <span className="hidden font-mono text-xs text-ink-faint sm:inline">{email}</span>}
              <Link href="/feed" className={btnPrimary}>
                Open your feed
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/login"
                className="hidden text-[15px] font-medium text-ink-soft transition-colors hover:text-ink sm:inline"
              >
                Sign in
              </Link>
              <Link href="/signup" className={btnPrimary}>
                Get started
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1360px] flex-1 px-3 pb-4 sm:px-6">
        {/* ── hero ───────────────────────────────────────────────────── */}
        <section className="dotgrid grid items-center gap-12 overflow-hidden rounded-[32px] px-4 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:px-[52px] lg:py-14">
          <div className="min-w-0">
            {/* The live chip: a real count and the index's real edition date. */}
            <div className="inline-flex max-w-full items-center gap-2.5 rounded-full bg-card px-4 py-2">
              <span className="blip h-[7px] w-[7px] shrink-0 rounded-full bg-lime" aria-hidden="true" />
              <span className="truncate font-mono text-[11.5px] text-ink-body">
                {typeof openJobs === "number" ? `${openJobs.toLocaleString()} open roles on file · ` : ""}
                {synced}
              </span>
            </div>

            <h1 className="display mt-5 text-[32px] text-ink sm:text-[46px] lg:text-[68px]">
              Ten applications,{" "}
              <span className="relative inline-block whitespace-nowrap">
                <Scribble />
                <span className="relative">already filled in</span>
              </span>
              ,{/* the design's line break, suppressed where the column is narrow */}
              <span className="hidden sm:inline">
                <br />
              </span>{" "}
              waiting when you get home.
            </h1>

            <p className="mt-6 max-w-[30rem] text-[16px] leading-[1.6] text-ink-body sm:text-[17px]">
              You&rsquo;re not losing this on your CV. You&rsquo;re losing it on the ninth form of the
              evening. Upload your CV once — we watch company job boards, score every opening against you,
              and fill each application from your real experience. You approve every single one before
              it&rsquo;s sent.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
              {primaryCta}
              {secondaryCta}
              {!signedIn && (
                <p className="text-[14.5px] leading-[1.45] text-ink-soft">
                  Ten free · no card
                  <br />
                  nothing sends without your approval
                </p>
              )}
            </div>

            {/*
              The design put a fabricated avatar stack and a "41 min" testimonial
              here. We have no users to name and no stopwatch data, so the slot
              says who the thing is for instead of pretending to count them.
            */}
            <p className="mt-9 flex items-start gap-3 text-[14px] leading-[1.5] text-ink-soft">
              <Tick className="mt-1 h-3.5 w-3.5" />
              Built for the people applying to ten a day — and losing the evening to it.
            </p>
          </div>

          {/* The register extract: real rows, live counts, no mockup. */}
          <div className="min-w-0">
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute inset-x-6 top-8 hidden h-[88%] rotate-[8deg] rounded-[24px] bg-line lg:block"
              />
              <div
                aria-hidden="true"
                className="absolute inset-x-3 top-4 hidden h-[92%] rotate-[4deg] rounded-[24px] bg-paper-tint lg:block"
              />

              <div className="relative rounded-[24px] bg-card px-5 py-5 shadow-[0_24px_60px_rgba(23,25,28,0.13)] sm:px-6 lg:-rotate-[1.4deg]">
                <div className="flex items-baseline justify-between gap-4">
                  <Eyebrow>Open right now</Eyebrow>
                  {typeof openJobs === "number" && (
                    <p className="font-mono text-[19px] leading-none tabular-nums text-ink">
                      {openJobs.toLocaleString()}
                    </p>
                  )}
                </div>

                {jobs.length > 0 ? (
                  <ul className="mt-3 flex flex-col">
                    {jobs.map((j) => (
                      <li
                        key={j.id}
                        className="field-rule flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                            {j.title}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                            {j.company}
                            {j.location ? ` · ${j.location}` : ""}
                          </p>
                          {j.sponsor_verdict?.licensed && (
                            <span className="mt-1.5 inline-block">
                              <SponsorBadge verdict={j.sponsor_verdict} location={j.location} />
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
                  <p className="px-1 py-10 text-center text-sm text-ink-soft">
                    Syncing job boards — check back shortly.
                  </p>
                )}

                <p className="mt-3 border-t border-line-soft pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  From the index · {synced}
                </p>
              </div>

              {/* The one floating mark — a guarantee rather than an invented number. */}
              <div className="absolute -top-3 right-1 inline-flex items-center gap-2 rounded-full bg-slate px-4 py-2.5 shadow-[0_12px_28px_rgba(23,25,28,0.18)] lg:-right-3">
                <Tick className="h-3 w-3" />
                <span className="font-mono text-[11.5px] text-on-slate">approved by you, or not at all</span>
              </div>

              {/*
                The design's third floating card was a fabricated receipt. This
                one carries a date we genuinely hold — the edition of the Home
                Office register the verdicts above were matched against — and it
                does not render at all when no verdict carries one.
              */}
              {registerDate && (
                <div className="absolute -bottom-6 -left-2 hidden w-[218px] -rotate-[4deg] rounded-xl bg-card px-4 py-3.5 shadow-[0_18px_44px_rgba(23,25,28,0.14)] lg:block">
                  <p className="text-center font-mono text-[10.5px] font-medium tracking-[0.2em] text-ink">
                    SPONSOR REGISTER
                  </p>
                  <div className="my-3 border-t border-dashed border-line" />
                  <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-ink-body">
                    <span>Home Office</span>
                    <span className="text-ink">{registerDate}</span>
                  </div>
                </div>
              )}
            </div>

            <p className={`px-1 text-[13px] leading-[1.55] text-ink-soft ${registerDate ? "mt-8 lg:mt-16" : "mt-8"}`}>
              Real openings from real company job boards — not a mockup. Sign up and every one of them gets
              scored against your profile.
            </p>
          </div>
        </section>

        {/* ── ATS strip ──────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col gap-4 px-2 sm:px-3 lg:flex-row lg:items-center lg:gap-11">
          <Eyebrow className="shrink-0">Fills applications on</Eyebrow>
          <div className="flex flex-wrap items-center gap-x-9 gap-y-2 text-[19px] font-bold tracking-[-0.03em] text-ink-faint">
            {ATS.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          <p className="font-mono text-[11px] text-ink-faint lg:ml-auto">
            never LinkedIn or Indeed credentials
          </p>
        </div>

        {/* ── how it works ───────────────────────────────────────────── */}
        <section id="how" className="mt-28 scroll-mt-8 px-2 sm:px-3">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="display mt-3.5 max-w-[620px] text-[30px] text-ink sm:text-[38px] lg:text-[44px]">
                Set it up once. Then it works the hours you can&rsquo;t.
              </h2>
            </div>
            <p className="max-w-[340px] text-[15px] leading-[1.6] text-ink-soft">
              Nothing here happens behind your back. Every step leaves something you can read.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className={`${cardCls} flex flex-col p-7`}>
              <p className="label-mono">Step 01</p>
              <p className="mt-3.5 text-[21px] font-bold tracking-[-0.025em] text-ink">Upload your CV once</p>
              <p className="mt-2.5 text-[14.5px] leading-[1.6] text-ink-body">
                We read it into a profile you can edit — dates, titles, salary bands, right to work. That
                profile is the only thing we ever answer from.
              </p>
              <div className={`${insetCls} mt-5 flex items-center gap-3 px-4 py-3.5`}>
                <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
                  <rect x="4" y="2" width="18" height="22" rx="3" fill="var(--color-line)" />
                  <rect x="8" y="7" width="10" height="1.8" rx="0.9" fill="var(--color-ink-faint)" />
                  <rect x="8" y="11" width="10" height="1.8" rx="0.9" fill="var(--color-ink-faint)" />
                  <rect x="8" y="15" width="6" height="1.8" rx="0.9" fill="var(--color-lime)" />
                </svg>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink">Your CV, as you wrote it</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-soft">parsed into a profile you edit</p>
                </div>
              </div>
            </div>

            <div className={`${cardCls} flex flex-col p-7`}>
              <p className="label-mono">Step 02</p>
              <p className="mt-3.5 text-[21px] font-bold tracking-[-0.025em] text-ink">We fill, you approve</p>
              <p className="mt-2.5 text-[14.5px] leading-[1.6] text-ink-body">
                Matched roles arrive already filled. Anything we can&rsquo;t back with your profile is left
                blank and handed to you. We flag it. We never guess.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <div
                  className={`${insetCls} flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] text-ink`}
                >
                  <span>A question your profile answers</span>
                  <Tick className="h-3.5 w-3.5" />
                </div>
                <div
                  className={`${insetCls} flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] text-ink`}
                >
                  <span>A question it can&rsquo;t</span>
                  <NeedsYouStamp />
                </div>
              </div>
            </div>

            <div className={`${cardDarkCls} flex flex-col p-7 md:col-span-2 lg:col-span-1`}>
              <p className="label-mono text-on-slate-faint">Step 03</p>
              <p className="mt-3.5 text-[21px] font-bold tracking-[-0.025em] text-on-slate">
                Sent, with a receipt
              </p>
              <p className="mt-2.5 text-[14.5px] leading-[1.6] text-on-slate-mute">
                Every submission keeps a record of what was sent, where each answer came from, and that you
                approved it. Failures are logged as loudly as successes.
              </p>
              {/*
                The design logged two invented submissions here ("14:32 sent ·
                Wise"). These are the terminal states the worker really records,
                with no fabricated times or employers attached to them.
              */}
              <div className="mt-5 flex flex-col gap-2.5 font-mono text-[11.5px]">
                <div className="grid grid-cols-[0.75rem_4.25rem_minmax(0,1fr)] items-start gap-x-2.5">
                  <Tick className="mt-0.5 h-3 w-3" />
                  <span className="text-on-slate">sent</span>
                  <span className="text-on-slate-soft">every answer, and that you approved it</span>
                </div>
                <div className="grid grid-cols-[0.75rem_4.25rem_minmax(0,1fr)] items-start gap-x-2.5">
                  <span aria-hidden="true" />
                  <span className="text-attention-bright">blocked</span>
                  <span className="text-on-slate-soft">bot wall, screenshot saved, apply-by-hand link</span>
                </div>
                <div className="grid grid-cols-[0.75rem_4.25rem_minmax(0,1fr)] items-start gap-x-2.5">
                  <span aria-hidden="true" />
                  <span className="text-attention-bright">failed</span>
                  <span className="text-on-slate-soft">the error kept, never counted as sent</span>
                </div>
              </div>
            </div>
          </div>

          {/*
            The differentiator, stated as a key rather than a demo: we can't show
            a filled application without inventing a person, and inventing one
            would contradict the exact promise being made. A legend is honest —
            it explains the system instead of performing it.
          */}
          <div className={`${cardCls} mt-4 p-7`}>
            <p className="label-mono">How to read a filled application</p>
            <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROVENANCE_LEGEND.map(([source, copy]) => (
                <div key={source}>
                  <dt>
                    <Provenance source={source} />
                  </dt>
                  <dd className="mt-2 text-[14px] leading-[1.55] text-ink-body">{copy}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── safeguards ─────────────────────────────────────────────── */}
        <section id="safeguards" className="mt-28 scroll-mt-8 px-2 sm:px-3">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div>
              <Eyebrow>Safeguards</Eyebrow>
              <h2 className="display mt-3.5 max-w-[660px] text-[30px] text-ink sm:text-[38px] lg:text-[44px]">
                The four rules we wrote down before we wrote the product.
              </h2>
            </div>
            <p className="max-w-[340px] text-[15px] leading-[1.6] text-ink-soft">
              Applying for you is a serious thing to hand over. These are the limits, and they are not
              settings you can turn off.
            </p>
          </div>

          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SAFEGUARDS.map((s) => (
              <div key={s.title} className={`${cardCls} p-7`}>
                {s.icon}
                <p className="mt-[18px] text-[19px] font-bold tracking-[-0.02em] text-ink">{s.title}</p>
                <p className="mt-2.5 text-[14.5px] leading-[1.6] text-ink-body">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── comparison ─────────────────────────────────────────────── */}
        <section className="mt-28 px-2 sm:px-3">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div>
              <Eyebrow>Compared</Eyebrow>
              <h2 className="display mt-3.5 max-w-[660px] text-[30px] text-ink sm:text-[38px] lg:text-[44px]">
                Faster than doing it yourself. Honest, unlike the bots.
              </h2>
            </div>
            <p className="max-w-[340px] text-[15px] leading-[1.6] text-ink-soft">
              The mass-apply tools work by guessing and firing. That&rsquo;s what gets people filtered out —
              and it&rsquo;s the one thing we won&rsquo;t do.
            </p>
          </div>

          <div className={`${cardCls} mt-9 overflow-x-auto`}>
            <div className="min-w-[900px] px-7 pb-7 pt-2">
              <div className="grid grid-cols-[minmax(0,1fr)_240px_180px_180px] items-end gap-6 pb-4 pt-5">
                <span />
                <div className="rounded-[14px] bg-lime px-4 py-3">
                  <p className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">apply4you</p>
                </div>
                <p className="pb-3 text-[15px] font-semibold text-ink-soft">Bulk auto-appliers</p>
                <p className="pb-3 text-[15px] font-semibold text-ink-soft">Doing it yourself</p>
              </div>

              {COMPARE.map(([label, ours, bots, manual]) => (
                <div
                  key={label}
                  className="grid grid-cols-[minmax(0,1fr)_240px_180px_180px] items-center gap-6 border-t border-line-soft py-4"
                >
                  <p className="text-[15px] font-semibold text-ink">{label}</p>
                  <p className="text-[15px] text-ink">{ours}</p>
                  <p className="text-[15px] text-ink-soft">{bots}</p>
                  <p className="text-[15px] text-ink-soft">{manual}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── pricing ────────────────────────────────────────────────── */}
        <section id="pricing" className="mt-28 scroll-mt-8 px-2 sm:px-3">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div>
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="display mt-3.5 max-w-[620px] text-[30px] text-ink sm:text-[38px] lg:text-[44px]">
                Ten applications free. Nothing to pay, because there is nothing to pay yet.
              </h2>
            </div>
            <p className="max-w-[340px] text-[15px] leading-[1.6] text-ink-soft">
              No card to start — there is nowhere on the site to put one. Keep every receipt either way.
            </p>
          </div>

          <div className="mt-9 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,22rem)]">
            <div className={`${cardCls} flex flex-col p-8`}>
              <p className="label-mono">Free</p>
              <p className="display mt-4 text-[46px] leading-none text-ink">£0</p>
              <p className="mt-1.5 text-[15px] text-ink-soft">Ten applications, filled and sent.</p>
              <div className="mt-6 flex flex-col gap-3 border-t border-line-soft pt-5">
                {[
                  "The full job feed, scored against your profile",
                  "Sponsor licence checks on employers we can match",
                  "Every answer shows where it came from",
                  "A receipt for each application, yours to keep",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <Tick className="mt-1 h-3.5 w-3.5" />
                    <p className="text-[15px] leading-[1.5] text-ink">{f}</p>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-7">
                <Link href={signedIn ? "/feed" : "/signup"} className={btnSecondary}>
                  {signedIn ? "Open your feed" : "Start with ten"}
                </Link>
              </div>
            </div>

            {/*
              The design's middle card sold "Unlimited, £19/month". Stripe is not
              wired up (README: billing deferred, everyone runs on free-plan
              defaults), so quoting a price here would be the page's one lie. The
              truth is a better card anyway.
            */}
            <div className={`${cardDarkCls} flex flex-col p-8`}>
              <div className="flex items-center justify-between gap-4">
                <p className="label-mono text-on-slate-faint">After the first ten</p>
                <span className="rounded-full bg-lime px-3 py-1 font-mono text-[11px] text-lime-ink">
                  not charging yet
                </span>
              </div>
              <p className="display mt-4 text-[34px] leading-[1.05] text-on-slate sm:text-[40px]">
                Nothing to buy
              </p>
              <p className="mt-2.5 text-[15px] leading-[1.5] text-on-slate-mute">
                Billing isn&rsquo;t switched on. There is no card field, no plan to choose and nothing to
                cancel — everyone who signs up gets the free ten while the submission pipeline is being
                proven on real applications, ours included.
              </p>
              <div className="mt-6 flex flex-col gap-3 border-t border-slate-line pt-5">
                {[
                  "Everything above, with no upsell in the way",
                  "Matches filled ahead of you, ready when you open it",
                  "Cover letters drafted per role, yours to edit",
                  "If a price ever appears, it appears here first",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <Tick className="mt-1 h-3.5 w-3.5" />
                    <p className="text-[15px] leading-[1.5] text-on-slate-soft">{f}</p>
                  </div>
                ))}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-4 pt-7">
                <Link
                  href={signedIn ? "/feed" : "/signup"}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-card px-7 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-paper-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-slate"
                >
                  {signedIn ? "Go to your job feed" : "Upload my CV"}
                  <Arrow />
                </Link>
                <span className="font-mono text-[12px] text-on-slate-faint">no card, nowhere to put one</span>
              </div>
            </div>

            <div className="flex flex-col rounded-[22px] bg-paper-deep p-7">
              <p className="label-mono">What counts as one</p>
              <p className="mt-4 text-[15px] leading-[1.65] text-ink-body">
                An application counts once you have approved it and it has reached the employer. Blocked
                attempts, bot walls and drafts you never sent don&rsquo;t count against your ten.
              </p>
              <div className="mt-auto flex flex-col gap-4 pt-6">
                <div>
                  <p className="font-mono text-[24px] leading-none tabular-nums text-ink">10</p>
                  <p className="mt-1 text-[13.5px] text-ink-soft">applications on the free plan</p>
                </div>
                <div>
                  <p className="font-mono text-[24px] leading-none tabular-nums text-ink">0</p>
                  <p className="mt-1 text-[13.5px] text-ink-soft">ever sent without your approval</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── faq ────────────────────────────────────────────────────── */}
        <section className="mt-28 px-2 sm:px-3">
          <Eyebrow>Questions</Eyebrow>
          <h2 className="display mt-3.5 max-w-[620px] text-[30px] text-ink sm:text-[38px] lg:text-[44px]">
            The things people ask before they trust it.
          </h2>

          <div className="mt-9 grid gap-4 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className={`${cardCls} p-7`}>
                <p className="text-[17.5px] font-bold tracking-[-0.02em] text-ink">{item.q}</p>
                <p className="mt-2.5 text-[15px] leading-[1.6] text-ink-body">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── closing cta ────────────────────────────────────────────── */}
        <section className="mt-28 flex flex-col gap-8 rounded-[32px] bg-lime px-6 py-12 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-[52px] lg:py-14">
          <div>
            <h2 className="display max-w-[640px] text-[30px] text-ink sm:text-[36px] lg:text-[42px]">
              Ten applications free. Nothing sends until you say so.
            </h2>
            <p className="mt-3.5 text-[15.5px] leading-[1.55] text-lime-ink">
              Upload your CV, read what we filled in, and close the tab if it isn&rsquo;t right. There is no
              card to enter and nothing has been sent.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link href={signedIn ? "/feed" : "/signup"} className={btnPrimary}>
              {signedIn ? "Go to your job feed" : "Upload my CV"}
              <Arrow />
            </Link>
            <Link
              href="/check"
              className="inline-flex items-center justify-center rounded-full border-[1.5px] border-ink/25 px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Check a visa sponsor
            </Link>
          </div>
        </section>

        {/* ── footer ─────────────────────────────────────────────────── */}
        <footer className="mt-4 mb-2 rounded-[32px] bg-slate px-6 py-10 text-on-slate sm:px-10 sm:py-11 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
            <div>
              <Link
                href="/"
                className="flex items-center gap-2.5 text-[18px] font-extrabold tracking-[-0.03em] text-on-slate"
              >
                <Logo tone="paper" />
                apply4you
              </Link>
              <p className="mt-4 max-w-[300px] text-[14.5px] leading-[1.6] text-on-slate-faint">
                Applications filled from your own facts, sent only when you approve them.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="label-mono text-on-slate-faint">Product</p>
              <Link href="/feed" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Job feed
              </Link>
              <Link href="/dashboard" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Dashboard
              </Link>
              <Link href="/signup" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Upload your CV
              </Link>
            </div>

            <div className="flex flex-col gap-3">
              <p className="label-mono text-on-slate-faint">Trust</p>
              <Link href="#safeguards" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Safeguards
              </Link>
              <Link href="/check" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Sponsor checker
              </Link>
              <Link href="/privacy" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Privacy
              </Link>
              <Link href="/terms" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Terms
              </Link>
            </div>

            <div className="flex flex-col gap-3">
              <p className="label-mono text-on-slate-faint">Account</p>
              <Link href="/login" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Sign in
              </Link>
              <Link href="/signup" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Create an account
              </Link>
              <Link href="/profile" className="text-[14.5px] text-on-slate-soft hover:text-on-slate">
                Your profile
              </Link>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-slate-hair pt-5 font-mono text-[11.5px] text-on-slate-faint sm:flex-row sm:items-center sm:justify-between">
            <p>Greenhouse · Lever · Ashby · Workable — never LinkedIn or Indeed credentials</p>
            <p>
              {registerDate
                ? `Sponsor data: Home Office register, ${registerDate}`
                : "Sponsor data: Home Office register of licensed sponsors"}
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
