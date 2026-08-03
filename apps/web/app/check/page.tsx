import Link from "next/link";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGISTER_URL, normalizeCompanyName } from "@/lib/sponsors";
import { cardCls, inputCls } from "@/components/ui";

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
  const skilledWorker = routes.includes("Skilled Worker");

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-sm font-bold tracking-tight text-ink">
            Apply<span className="text-accent">4</span>You
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Start free
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink">UK Visa Sponsor Licence Checker</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Instantly check any employer against the Home Office register of licensed sponsors. Free, no
          account needed.
        </p>

        <form method="GET" className="mt-6 flex gap-2">
          <input
            name="q"
            defaultValue={queryRaw}
            placeholder="Employer name — e.g. Figma, Monzo, Deloitte"
            className={`${inputCls} max-w-md`}
            maxLength={80}
            required
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Check
          </button>
        </form>

        {rateLimited && (
          <div className={`${cardCls} mt-6 p-5`}>
            <p className="text-sm text-ink">
              Too many checks from this connection in a short time — try again in a minute.
            </p>
          </div>
        )}

        {!rateLimited && key && exact.length > 0 && (
          <div className={`${cardCls} mt-6 border-accent/40 p-5`}>
            <p className="font-mono text-xs uppercase tracking-wide text-accent">✓ licence found</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">
              {orgNames[0]}
              {orgNames.length > 1 ? ` (+${orgNames.length - 1} related entries)` : ""}
            </h2>
            <p className="mt-2 text-sm text-ink">
              Holds a Home Office sponsor licence
              {ratings.length ? ` — ${ratings.join(", ")}` : ""}
              {routes.length ? (
                <>
                  {" "}
                  for: <span className="font-medium">{routes.join(" · ")}</span>
                </>
              ) : null}
              .
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              Register of licensed sponsors as of {exact[0]?.register_date} (
              <a href={REGISTER_URL} target="_blank" rel="noreferrer" className="underline">
                gov.uk source
              </a>
              ). A licence means this employer can sponsor for the route(s) shown above — it does not
              guarantee they will sponsor a specific role.
              {!skilledWorker &&
                " Note: this licence does not include the Skilled Worker route, which is the main work-visa route for most jobs — a licence for other routes (e.g. Temporary Worker categories like Charity, Religious, or Creative Worker) cannot be used to sponsor standard skilled work."}{" "}
              Always confirm directly with the employer.
            </p>

            <div className="mt-4 border-t border-line pt-4">
              {liveJobs > 0 ? (
                <p className="text-sm text-ink">
                  <span className="font-mono font-semibold text-accent">{liveJobs}</span> live job
                  {liveJobs === 1 ? "" : "s"} from this employer in Apply4You right now.{" "}
                  <Link href="/signup" className="font-medium text-accent underline">
                    Sign up free
                  </Link>{" "}
                  and our AI applies to the ones you approve — you review every application before it
                  goes anywhere.
                </p>
              ) : (
                <p className="text-sm text-ink-soft">
                  No live openings from this employer in our index right now.{" "}
                  <Link href="/signup" className="font-medium text-accent underline">
                    Sign up free
                  </Link>{" "}
                  to get matched with jobs at licensed sponsors — applications filled by AI, approved
                  by you.
                </p>
              )}
            </div>
          </div>
        )}

        {!rateLimited && key && exact.length === 0 && (
          <div className={`${cardCls} mt-6 p-5`}>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">no exact match</p>
            <p className="mt-2 text-sm text-ink">
              &ldquo;{queryRaw}&rdquo; didn&apos;t match a register entry. Companies often register
              under a different legal name — try the suggestions below, or search the{" "}
              <a href={REGISTER_URL} target="_blank" rel="noreferrer" className="underline">
                official register
              </a>
              .
            </p>
            {near.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {near.map((n) => (
                  <li key={n.org_name}>
                    <Link
                      href={`/check?q=${encodeURIComponent(n.org_name)}`}
                      className="text-sm text-accent underline"
                    >
                      {n.org_name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-10 text-xs text-ink-soft/70">
          Data: UK Home Office &ldquo;Worker and Temporary Worker&rdquo; register of licensed
          sponsors{latestRegisterDate ? `, ${latestRegisterDate} edition` : ""}. We sync a new edition
          when the Home Office publishes one (typically weekly). This checker is informational and not
          immigration advice.
        </p>
      </div>
    </main>
  );
}
