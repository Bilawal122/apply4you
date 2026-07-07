import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";

const NAV = [
  { href: "/feed", label: "Job feed" },
  { href: "/applications", label: "Applications" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/preferences", label: "Preferences" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/feed" className="text-sm font-bold tracking-tight">
              Apply4You
            </Link>
            <nav className="flex gap-4">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-sm text-neutral-600 hover:text-neutral-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
