"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-500">Welcome back to Apply4You.</p>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        No account?{" "}
        <Link href="/signup" className="font-medium text-neutral-900 underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
