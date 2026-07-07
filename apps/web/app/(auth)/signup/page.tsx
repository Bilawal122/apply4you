"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload a resume once. Apply to dozens of jobs a day.
        </p>
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
          minLength={8}
          placeholder="Password (8+ characters)"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
