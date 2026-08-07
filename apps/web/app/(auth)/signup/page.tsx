"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";
import { Tick, Wordmark, btnPrimary, inputCls, labelCls } from "@/components/ui";

/*
  Same split as sign-in. The dark half is the guardrails, not an activity feed:
  a visitor who has not signed up yet has no activity, and the mock's "23 sent
  this week" would be a number invented on the one screen where the product
  first asks to be trusted.
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

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);

  if (state && "confirmEmail" in state) {
    return (
      <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center bg-paper px-6 py-16 sm:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-[400px]">
            <Wordmark />

            <h1 className="display mt-12 text-[32px] text-ink sm:text-[40px]">Check your email</h1>
            <p className="mt-4 text-[15px] leading-[1.6] text-ink-body">
              We sent a confirmation link to your inbox. Click it and you&apos;re in — it signs you in and
              starts your setup: upload your resume, set your criteria, and we start finding jobs for you.
            </p>
            <p className="mt-6 text-[14px] text-ink-soft">
              Already confirmed?{" "}
              <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <Guardrails />
      </main>
    );
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex flex-col justify-center bg-paper px-6 py-16 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <Wordmark />

          <h1 className="display mt-12 text-[32px] text-ink sm:text-[40px]">Create your account</h1>
          <p className="mt-2.5 text-[16px] text-ink-soft">
            Upload a resume once. Apply to dozens of jobs a day.
          </p>

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
                minLength={8}
                placeholder="Password (8+ characters)"
                className={inputCls}
              />
            </div>
            {state && "error" in state && (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] font-medium leading-[1.5] text-danger">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className={`${btnPrimary} mt-1 w-full`}>
              {pending ? "Creating account…" : "Sign up"}
            </button>
          </form>

          <p className="mt-7 text-[14px] text-ink-soft">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <Guardrails />
    </main>
  );
}
