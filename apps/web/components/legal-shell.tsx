import Link from "next/link";
import { btnSecondarySm, cardCls } from "@/components/ui";

/*
  Shared chrome for the public legal pages.

  These are the two documents in the product that are meant to be *read*, so
  they get a reading layout rather than an app layout: one white card floating
  on paper, a display masthead, and a measure capped at 68 characters. Section
  headings are the same mono eyebrow used everywhere else — a legal document
  is a register too, and the ruled sections make it scannable without shouting.

  Not a word of the copy itself is set here; it lives in the pages.
*/
export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-[17px] font-extrabold tracking-[-0.03em] text-ink"
          >
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="4" cy="9" r="3.4" fill="var(--color-ink)" />
              <circle cx="13" cy="5" r="2.2" fill="var(--color-lime)" />
              <circle cx="13.5" cy="13" r="2.2" fill="var(--color-ink)" />
            </svg>
            apply4you
          </Link>
          <Link href="/login" className={btnSecondarySm}>
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-5">
        <article className={`${cardCls} px-6 py-10 sm:px-10 sm:py-12`}>
          <p className="label-mono">Legal</p>
          <h1 className="display mt-3 text-[30px] text-ink sm:text-[34px]">{title}</h1>
          <p className="mt-2.5 font-mono text-[11.5px] text-ink-soft">Last updated {updated}</p>

          <div className="mt-9 flex max-w-[68ch] flex-col gap-7 text-[15px] leading-relaxed text-ink-body">
            {children}
          </div>
        </article>

        <div className="mt-6 flex gap-6 px-1 text-[13.5px] text-ink-soft">
          <Link href="/privacy" className="underline underline-offset-2 transition-colors hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="underline underline-offset-2 transition-colors hover:text-ink">
            Terms
          </Link>
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line-soft pt-7">
      <h2 className="label-mono">{heading}</h2>
      <div className="mt-3.5 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}
