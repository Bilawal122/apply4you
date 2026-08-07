"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
  The app's real routes, in the order the sidebar reads them.

  The design mock hangs a mono count badge off three of these ("64", "7", "23").
  This component has no data, and the shell that renders it is a layout — a
  layout is not re-run on client navigation, so a count fetched there would
  still read "7 need you" after you had just approved all seven. A number that
  is silently stale is worse than no number, so the badges are omitted rather
  than faked or wired to something unreliable.

  There is no separate "needs you" route either: /applications *is* the review
  queue (its first section is "Waiting for review"), so it appears once, under
  the name the app actually gives it.
*/
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/feed", label: "Job feed" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "Profile" },
  { href: "/preferences", label: "Preferences" },
  { href: "/check", label: "Sponsor checker" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    /* A vertical rail from md up; on a phone it lies down and scrolls inside
       itself so the page body never scrolls sideways. */
    <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5 md:mx-0 md:flex-col md:gap-[3px] md:overflow-x-visible md:px-0 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              active ? "bg-paper-deep text-ink" : "text-ink-soft hover:bg-paper-deep/60 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
