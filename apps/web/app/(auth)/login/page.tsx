"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";
import { btnPrimary, inputCls } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-accent">Apply4You</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">Your applications are waiting.</p>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="you@example.com" className={inputCls} />
        <input name="password" type="password" required placeholder="Password" className={inputCls} />
        {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-ink-soft">
        No account?{" "}
        <Link href="/signup" className="font-medium text-accent underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
