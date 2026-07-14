import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const email = typeof data.claims.email === "string" ? data.claims.email : null;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-6">
            <Link href="/feed" className="text-sm font-bold tracking-tight text-ink">
              Apply<span className="text-accent">4</span>You
            </Link>
            <NavLinks />
          </div>
          <div className="flex items-center gap-3">
            {email && (
              <span className="hidden font-mono text-xs text-ink-soft sm:inline" title="Signed in as">
                {email}
              </span>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
