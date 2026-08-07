"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ResetState } from "../actions";
import { Tick, Wordmark, btnPrimary, inputCls, labelCls } from "@/components/ui";

/* Split layout, guardrails on the dark half — see login/page.tsx. */
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

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestPasswordReset, null);

  if (state && "sent" in state) {
    return (
      <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center bg-paper px-6 py-16 sm:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-[400px]">
            <Wordmark />

            <h1 className="display mt-12 text-[32px] text-ink sm:text-[40px]">Check your email</h1>
            <p className="mt-4 text-[15px] leading-[1.6] text-ink-body">
              If an account exists for that address, we sent a password reset link. It expires in an hour.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-[14px] font-semibold text-ink underline underline-offset-2"
            >
              Back to sign in
            </Link>
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

          <h1 className="display mt-12 text-[32px] text-ink sm:text-[40px]">Reset your password</h1>
          <p className="mt-2.5 text-[16px] text-ink-soft">We&apos;ll email you a link to choose a new one.</p>

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
            {state && "error" in state && (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] font-medium leading-[1.5] text-danger">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className={`${btnPrimary} mt-1 w-full`}>
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-7 text-[14px] text-ink-soft">
            Remembered it?{" "}
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
