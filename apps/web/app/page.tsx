import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function MockField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-ink-soft">{label}</p>
      <p className={`mt-0.5 rounded border border-line bg-paper px-2 py-1 text-xs text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export default async function LandingPage() {
  // Session-aware: a signed-in visitor should be recognized, not shown a
  // stranger's marketing page.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

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

        <div aria-hidden className="hidden lg:block">
          <div className="rounded-lg border border-line bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <div>
                <p className="text-sm font-semibold text-ink">Backend Engineer, Billing</p>
                <p className="text-xs text-ink-soft">Stripe · San Francisco</p>
              </div>
              <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">
                filling…
              </span>
            </div>
            <div className="hero-fill flex flex-col gap-3">
              <MockField label="Full name" value="Jordan Reyes" />
              <MockField label="Are you authorized to work in the US?" value="Yes" />
              <MockField label="Will you require visa sponsorship?" value="No" />
              <MockField label="Current employer" value="Acme Analytics" />
              <div>
                <p className="text-[11px] font-medium text-attention">
                  Do you plan to work remotely? — needs your answer
                </p>
                <p className="mt-0.5 rounded border border-dashed border-attention/40 bg-attention-soft px-2 py-1 font-mono text-xs text-attention">
                  null — we never guess for you
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center font-mono text-[11px] text-ink-soft">
            what the machine fills is always visible — and editable — before submit
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
