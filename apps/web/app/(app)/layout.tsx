import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo, Tick, cardDarkCls } from "@/components/ui";

/** The wordmark's three dots. The lime one is the affirmative, as everywhere else. */
/**
 * Initials from the signed-in address — the only name this shell actually has.
 * The layout reads auth claims, not the profile row, so rather than invent a
 * display name (or spend a second query on one) the avatar is derived from the
 * address it sits next to.
 */
function initialsFrom(email: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const words = local.split(/[^a-z0-9]+/i).filter((w) => /[a-z]/i.test(w));
  const initials = words
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("");
  return initials ? initials.toUpperCase() : "·";
}

function Avatar({ initials, className }: { initials: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-lime font-bold text-lime-ink ${className}`}
    >
      {initials}
    </span>
  );
}

/*
  The design puts a "3 of your 10 free applications left · Go unlimited · £19"
  card here. The app does track a plan limit, but the shell can't read it
  without a second round-trip that would go stale the moment a submission
  landed, and there is no checkout to send anyone to — so quoting a price and a
  remaining balance here would be two claims the product can't back.

  The guardrails panel says something the product *can* back on every screen,
  and each line is enforced somewhere real: approval gates every submission,
  unanswered fields come back as "we didn't guess", and account deletion is a
  hard delete of rows and stored files alike.
*/
const GUARDRAILS = [
  "Nothing sends without your approval.",
  "No answer is invented — blanks are handed back to you.",
  "We never submit to LinkedIn or Indeed.",
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  const initials = initialsFrom(email);

  return (
    <div className="min-h-screen bg-paper md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      {/*
        One element, two shapes: a 236px rail from md up, and below that a
        sticky top bar whose nav scrolls inside itself.
      */}
      <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-line bg-card/95 px-4 py-3 backdrop-blur md:h-screen md:gap-6 md:overflow-y-auto md:border-r md:border-b-0 md:bg-paper md:py-[22px] md:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/feed"
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-1 text-[18px] font-extrabold tracking-[-0.03em] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Logo />
            apply4you
          </Link>
          {/* On a phone the rail has no bottom, so identity and sign-out ride up here. */}
          <div className="flex items-center gap-1 md:hidden">
            {email && (
              <>
                <Avatar initials={initials} className="h-8 w-8 text-[11.5px]" />
                <span className="sr-only">Signed in as {email}</span>
              </>
            )}
            <SignOutButton />
          </div>
        </div>

        <NavLinks />

        <div className="mt-auto hidden md:block">
          <div className={`${cardDarkCls} p-4`}>
            {/*
              The eyebrow is written out rather than using .label-mono: that
              class is unlayered CSS, so its ink colour beats any Tailwind
              colour utility layered under it, and this one sits on the dark
              panel.
            */}
            <p className="font-mono text-[10.5px] font-medium tracking-[0.1em] text-on-slate-faint uppercase">
              Guardrails
            </p>
            <ul className="mt-3 flex flex-col gap-2.5 text-[12.5px] leading-[1.45] text-on-slate-soft">
              {GUARDRAILS.map((line) => (
                <li key={line} className="flex gap-2">
                  <Tick className="mt-[3px] h-3 w-3" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {email && (
            <div className="mt-4 flex items-center gap-2.5 px-1.5">
              <Avatar initials={initials} className="h-[34px] w-[34px] text-[12.5px]" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-medium tracking-[0.08em] text-ink-faint uppercase">
                  signed in
                </p>
                <p className="truncate text-[13px] font-medium text-ink" title="Signed in as">
                  {email}
                </p>
              </div>
            </div>
          )}
          <div className="-mx-2 mt-0.5">
            <SignOutButton />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full min-w-0 max-w-[1160px] px-5 py-8 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
