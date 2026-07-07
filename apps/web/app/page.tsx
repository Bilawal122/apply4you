import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Apply to 50 jobs a day.
        <br />
        Review, approve, done.
      </h1>
      <p className="max-w-lg text-neutral-600">
        Upload your resume once. We find matching jobs, fill out every application with your real
        experience — never invented — and submit them after you approve.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          Get started free
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
