import Link from "next/link";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGISTER_URL, normalizeCompanyName } from "@/lib/sponsors";
import {
  Wordmark,
  Eyebrow,
  Hollow,
  Tick,
  btnPrimary,
  btnPrimarySm,
  btnSecondary,
  btnSecondarySm,
  cardCls,
} from "@/components/ui";

/**
 * Free, no-signup UK sponsor-licence checker (task #41, ROADMAP 1.2).
 * Public page — the shareable top-of-funnel asset. Reads only the public
 * sponsors table (RLS: world-readable government data); the live-jobs count
 * and rate limiting use the admin client server-side (aggregates/counters
 * only, no job data exposed, and end users can't touch their own rate-limit
 * row since anon has no grant on check_rate_limit()).
 * Conservative labeling per DECISIONS.md D5.
 */

// Next.js delivers repeated query params (?q=a&q=b) as string[] — coerce.
interface CheckParams {
  q?: string | string[];
}

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

interface SponsorRow {
  org_name: string;
  town: string | null;
  route: string | null;
  type_rating: string | null;
  register_date: string;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<CheckParams> }): Promise<Metadata> {
  const { q } = await searchParams;
  const name = firstParam(q).trim().slice(0, 60);
  return {
    title: name
      ? `Is ${name} a licensed UK visa sponsor? — Apply4You`
      : "UK Visa Sponsor Licence Checker — free, instant — Apply4You",
    description: name
      ? `Check whether ${name} holds a Home Office sponsor licence, and see their live open jobs.`
      : "Paste any employer's name and instantly check the Home Office register of licensed sponsors — free, no account needed.",
    // Query-parameterized results are reflected user input and low SEO value
    // on a fresh domain (also closes a reflected-content indexing vector) —
    // only the bare /check route is indexable.
    robots: name ? { index: false, follow: true } : undefined,
  };
}

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

async function checkerAllowed(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const key = createHash("sha256").update(ip).digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_max: RATE_LIMIT_MAX,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (error) return true; // fail open — a broken limiter must never take the page down
  return data !== false;
}

/** The one glyph in the search bar; a token can't reach an SVG stroke. */
function Magnifier() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] shrink-0 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.7 12.7 17 17" strokeLinecap="round" />
    </svg>
  );
}

/** A mono-labelled fact from the register. Machine value, so mono value. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 max-w-full">
      <dt className="label-mono">{label}</dt>
      <dd className="mt-1.5 break-words font-mono text-[13.5px] leading-[1.45] text-ink">{children}</dd>
    </div>
  );
}

export default async function CheckPage({ searchParams }: { searchParams: Promise<CheckParams> }) {
  const { q } = await searchParams;
  const queryRaw = firstParam(q).trim().slice(0, 80);
  const key = queryRaw ? normalizeCompanyName(queryRaw) : "";

  let exact: SponsorRow[] = [];
  let near: { org_name: string }[] = [];
  let liveJobs = 0;
  let rateLimited = false;

  if (key) {
    if (!(await checkerAllowed())) {
      rateLimited = true;
    } else {
      const supabase = await createClient();
      const { data: exactRows } = await supabase
        .from("sponsors")
        .select("org_name, town, route, type_rating, register_date")
        .eq("company_key", key)
        .limit(20)
        .overrideTypes<SponsorRow[]>();
      exact = exactRows ?? [];

      if (exact.length > 0) {
        const admin = createAdminClient();
        const { count } = await admin
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("company_key", key)
          .is("closed_at", null);
        liveJobs = count ?? 0;
      } else if (queryRaw.length >= 3) {
        // Only run the expensive leading-wildcard scan when there's no exact
        // hit to explain (the common "found it" path skips this entirely),
        // and require a few characters so a 1-2 char query can't force a
        // near-match-everything sequential scan.
        const supabase = await createClient();
        // Strip PostgREST/pg pattern metacharacters (%, _), the `*` PostgREST
        // itself translates to %, AND backslash (which could otherwise
        // escape the query's own closing %) — leaves plain text only.
        const safe = queryRaw.replace(/[%_*\\]/g, "");
        if (safe) {
          const { data: nearRows } = await supabase
            .from("sponsors")
            .select("org_name")
            .ilike("org_name", `%${safe}%`)
            .neq("company_key", key)
            .limit(60)
            .overrideTypes<{ org_name: string }[]>();
          near = [...new Map((nearRows ?? []).map((r) => [r.org_name, r])).values()].slice(0, 5);
        }
      }
    }
  }

  // Sourced independent of match outcome so the no-match state can still
  // show a real "as of" date instead of an unqualified "refreshed weekly"
  // claim (the whole table shares one edition date since it's replaced
  // atomically on each refresh, so any single row's date is the current one).
  let latestRegisterDate: string | null = exact[0]?.register_date ?? null;
  if (!latestRegisterDate && !rateLimited) {
    const supabase = await createClient();
    const { data } = await supabase.from("sponsors").select("register_date").limit(1).maybeSingle();
    latestRegisterDate = data?.register_date ?? null;
  }

  const routes = [...new Set(exact.map((r) => r.route).filter(Boolean))] as string[];
  const ratings = [...new Set(exact.map((r) => r.type_rating).filter(Boolean))] as string[];
  const orgNames = [...new Set(exact.map((r) => r.org_name))];
  // The register's own address column — the only "where" we actually hold.
  const towns = [...new Set(exact.map((r) => r.town).filter(Boolean))] as string[];
  const skilledWorker = routes.includes("Skilled Worker");
  const registerDate = exact[0]?.register_date;

  // Subline under the verdict: register locations, plus the honest note that
  // one employer name can appear as several register entries.
  const subline = [
    towns.slice(0, 3).join(" · ") || null,
    towns.length > 3 ? `+${towns.length - 3} more locations` : null,
    orgNames.length > 1 ? `+${orgNames.length - 1} related register entries` : null,
  ].filter(Boolean);

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <Wordmark />
        <nav className="flex items-center gap-5 sm:gap-7">
          <Link
            href="/check"
            aria-current="page"
            className="hidden text-[13.5px] font-semibold text-ink sm:inline"
          >
            Sponsor checker
          </Link>
          <Link
            href="/login"
            className="hidden text-[13.5px] text-ink-soft transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </Link>
          <Link href="/signup" className={btnPrimarySm}>
            Get started
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:pt-14">
        <Eyebrow>Free tool · no account</Eyebrow>
        <h1 className="display mt-4 text-[36px] text-ink sm:text-[52px]">
          UK Visa Sponsor Licence Checker
        </h1>
        <p className="mt-5 max-w-xl text-[15.5px] leading-[1.6] text-ink-body">
          Instantly check any employer against the Home Office register of licensed sponsors. Free, no
          account needed.
        </p>

        <form
          method="GET"
          className="mt-8 flex items-center gap-2 rounded-[20px] bg-card p-2 pl-4 transition-shadow focus-within:ring-2 focus-within:ring-lime/50 sm:gap-3"
        >
          <Magnifier />
          <label htmlFor="q" className="sr-only">
            Employer name
          </label>
          <input
            id="q"
            name="q"
            defaultValue={queryRaw}
            placeholder="Employer name — e.g. Figma, Monzo, Deloitte"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
            maxLength={80}
            required
          />
          <button type="submit" className={`${btnPrimary} shrink-0`}>
            Check
          </button>
        </form>

        {rateLimited && (
          <div className={`${cardCls} mt-8 p-6 sm:p-7`}>
            <Eyebrow>rate limited</Eyebrow>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink-body">
              Too many checks from this connection in a short time — try again in a minute.
            </p>
          </div>
        )}

        {!rateLimited && key && exact.length > 0 && (
          <section className={`${cardCls} mt-8 p-6 sm:p-8`}>
            <Tick className="h-9 w-9" />
            <Eyebrow className="mt-5">Home Office sponsor register</Eyebrow>
            <h2 className="display mt-2 text-[26px] text-ink sm:text-[32px]">
              {orgNames[0]} holds a licence
            </h2>
            {subline.length > 0 && (
              <p className="mt-2.5 font-mono text-[12.5px] leading-[1.5] text-ink-soft">
                {subline.join(" · ")}
              </p>
            )}

            <div className="mt-6 border-t border-line-soft pt-6">
              <dl className="flex flex-wrap gap-x-10 gap-y-5">
                {routes.length > 0 && <Fact label="Route">{routes.join(" · ")}</Fact>}
                {ratings.length > 0 && <Fact label="Rating">{ratings.join(" · ")}</Fact>}
                {registerDate && <Fact label="Register checked">{registerDate}</Fact>}
                <Fact label="Open roles on file">
                  <span className="tabular-nums">{liveJobs}</span>
                </Fact>
              </dl>
            </div>

            {/*
              The load-bearing element of this page. A licence is permission to
              sponsor, never a promise about a specific role, and the register
              edition it was read from is always stated. Wording unchanged.
            */}
            <div className="mt-7 rounded-xl bg-attention-soft px-5 py-4">
              <p className="label-mono text-attention">A licence is not a promise</p>
              <p className="mt-2 text-[13.5px] leading-[1.65] text-ink-body">
                Register of licensed sponsors as of {registerDate} (
                <a
                  href={REGISTER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  gov.uk source
                </a>
                ). A licence means this employer can sponsor for the route(s) shown above — it does
                not guarantee they will sponsor a specific role.
                {!skilledWorker &&
                  " Note: this licence does not include the Skilled Worker route, which is the main work-visa route for most jobs — a licence for other routes (e.g. Temporary Worker categories like Charity, Religious, or Creative Worker) cannot be used to sponsor standard skilled work."}{" "}
                Always confirm directly with the employer.
              </p>
            </div>

            <div className="mt-7 border-t border-line-soft pt-6">
              <p className="text-[14.5px] leading-[1.6] text-ink-body">
                {liveJobs > 0 ? (
                  <>
                    Those roles are live in the Apply4You index right now. Sign up free and our AI
                    applies to the ones you approve — you review every application before it goes
                    anywhere.
                  </>
                ) : (
                  <>
                    No live openings from this employer in our index right now. Sign up free to get
                    matched with jobs at licensed sponsors — applications filled by AI, approved by
                    you.
                  </>
                )}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/signup" className={btnPrimary}>
                  Sign up free
                </Link>
                <a href={REGISTER_URL} target="_blank" rel="noreferrer" className={btnSecondary}>
                  Open the gov.uk register
                </a>
              </div>
            </div>
          </section>
        )}

        {/*
          Not a failure state, and deliberately not styled as one: absence from
          the register is a statement about our lookup, not about the employer.
        */}
        {!rateLimited && key && exact.length === 0 && (
          <section className={`${cardCls} mt-8 p-6 sm:p-8`}>
            <Hollow className="h-8 w-8" />
            <Eyebrow className="mt-5">no exact match</Eyebrow>
            <p className="mt-2.5 text-[15px] leading-[1.6] text-ink-body">
              &ldquo;{queryRaw}&rdquo; didn&apos;t match a register entry. Companies often register
              under a different legal name — try the suggestions below, or search the{" "}
              <a
                href={REGISTER_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                official register
              </a>
              .
            </p>
            {near.length > 0 && (
              <div className="mt-6 border-t border-line-soft pt-6">
                <Eyebrow>Similar names on the register</Eyebrow>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {near.map((n) => (
                    <li key={n.org_name} className="max-w-full">
                      <Link
                        href={`/check?q=${encodeURIComponent(n.org_name)}`}
                        className={`${btnSecondarySm} max-w-full`}
                      >
                        <span className="min-w-0 truncate">{n.org_name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <p className="mt-12 max-w-2xl text-[12.5px] leading-[1.6] text-ink-faint">
          Data: UK Home Office &ldquo;Worker and Temporary Worker&rdquo; register of licensed
          sponsors{latestRegisterDate ? `, ${latestRegisterDate} edition` : ""}. We sync a new edition
          when the Home Office publishes one (typically weekly). This checker is informational and not
          immigration advice.
        </p>
      </div>
    </main>
  );
}
