"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";
import { Tick, Wordmark, btnPrimary, inputCls, labelCls } from "@/components/ui";

/*
  The split sign-in screen: form on paper, a dark panel beside it.

  The design mock fills that dark panel with an activity log — "7 applications
  are waiting", "23 sent this week". A signed-out visitor's activity is
  unknowable by definition, so rendering it would be inventing the one thing
  this product promises never to invent. The panel states the guardrails
  instead: true whether or not anyone is logged in, and the actual reason to
  sign in here rather than somewhere else.
*/
function Guardrails() {
  return (
    <aside className="flex flex-col justify-center bg-slate px-6 py-14 text-on-slate sm:px-12 lg:px-16">
      <div className="mx-auto w-full max-w-[430px]">
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-on-slate-faint">
          Guardrails
        </p>
        <p className="mt-5 text-[19px] font-bold leading-[1.3] tracking-[-0.02em] text-on-slate">
          What this product will and won&apos;t do on your behalf.
        </p>
        <ul className="mt-7 flex flex-col gap-4">
          {[
            "Nothing is submitted without your approval.",
            "No answer is invented — fields your profile can't back are left blank and handed to you.",
            "We never submit to, or store credentials for, LinkedIn or Indeed.",
            "Delete your account and your profile, resume and applications go with it.",
          ].map((rule) => (
            <li key={rule} className="flex gap-3">
              <Tick className="mt-[5px] h-3.5 w-3.5" />
              <span className="text-[14.5px] leading-[1.55] text-on-slate-soft">{rule}</span>
            </li>
          ))}
        </ul>
        <p className="mt-9 font-mono text-[10.5px] uppercase leading-[1.7] tracking-[0.1em] text-on-slate-faint">
          Greenhouse · Lever · Ashby · Workable — never LinkedIn or Indeed credentials
        </p>
      </div>
    </aside>
  );
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex flex-col justify-center bg-paper px-6 py-16 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <Wordmark />

          <h1 className="display mt-12 text-[32px] text-ink sm:text-[40px]">Welcome back.</h1>
          <p className="mt-2.5 text-[16px] text-ink-soft">Your applications are waiting.</p>

          <form action={action} className="mt-8 flex flex-col gap-4">
            <div>
              <label htmlFor="email" className={labelCls}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="password" className={labelCls}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Password"
                className={inputCls}
              />
            </div>
            {state && "error" in state && (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] font-medium leading-[1.5] text-danger">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className={`${btnPrimary} mt-1 w-full`}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[14px] text-ink-soft">
            <span>
              No account?{" "}
              <Link href="/signup" className="font-semibold text-ink underline underline-offset-2">
                Sign up
              </Link>
            </span>
            <Link href="/forgot-password" className="underline underline-offset-2 hover:text-ink">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>

      <Guardrails />
    </main>
  );
}
