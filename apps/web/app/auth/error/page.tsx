import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold text-ink">That link didn&apos;t work</h1>
      <p className="text-sm text-ink-soft">
        The link may have expired or already been used. Request a fresh one:
      </p>
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="font-medium text-accent underline">
          Send a new password reset email
        </Link>
        <Link href="/login" className="text-ink-soft underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
