"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/feed", label: "Job feed" },
  { href: "/applications", label: "Applications" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/preferences", label: "Preferences" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    /* Scrolls inside itself on narrow screens so the page body never does. */
    <nav className="flex min-w-0 gap-4 overflow-x-auto sm:gap-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-1 py-2 text-sm transition-colors ${
              active
                ? "border-accent font-medium text-ink"
                : "border-transparent text-ink-soft hover:border-line hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
