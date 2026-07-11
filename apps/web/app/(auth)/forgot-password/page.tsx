"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ResetState } from "../actions";
import { btnPrimary, inputCls } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestPasswordReset, null);

  if (state && "sent" in state) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold text-ink">Check your email</h1>
        <p className="text-sm text-ink-soft">
          If an account exists for that address, we sent a password reset link. It expires in an hour.
        </p>
        <Link href="/login" className="text-sm font-medium text-accent underline">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-accent">Apply4You</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-soft">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="you@example.com" className={inputCls} />
        {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
