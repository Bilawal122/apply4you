import Link from "next/link";

/** Shared chrome for the public legal pages. */
export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-sm font-bold tracking-tight text-ink">
            Apply<span className="text-accent">4</span>You
          </Link>
          <Link href="/login" className="text-sm text-ink-soft hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 font-mono text-xs text-ink-soft">Last updated {updated}</p>
        <div className="prose-legal mt-6 flex flex-col gap-4 text-sm leading-relaxed text-ink-soft">{children}</div>
        <div className="mt-10 flex gap-4 border-t border-line pt-4 text-sm">
          <Link href="/privacy" className="text-ink-soft underline hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="text-ink-soft underline hover:text-ink">
            Terms
          </Link>
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-semibold text-ink">{heading}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
