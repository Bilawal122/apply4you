"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";
import { btnPrimary, inputCls } from "@/components/ui";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);

  if (state && "confirmEmail" in state) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold text-ink">Check your email</h1>
        <p className="text-sm text-ink-soft">
          We sent a confirmation link to your inbox. Click it and you&apos;re in — it signs you in and
          starts your setup: upload your resume, set your criteria, and we start finding jobs for you.
        </p>
        <p className="text-xs text-ink-soft">
          Already confirmed?{" "}
          <Link href="/login" className="font-medium text-accent underline">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-accent">Apply4You</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-soft">Upload a resume once. Apply to dozens of jobs a day.</p>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="you@example.com" className={inputCls} />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ characters)"
          className={inputCls}
        />
        {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
