"use client";

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "../actions";
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

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState<UpdatePasswordState, FormData>(updatePassword, null);

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex flex-col justify-center bg-paper px-6 py-16 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <Wordmark />

          <h1 className="display mt-12 text-[32px] text-ink sm:text-[40px]">Choose a new password</h1>

          <form action={action} className="mt-8 flex flex-col gap-4">
            <div>
              <label htmlFor="password" className={labelCls}>
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="New password (8+ characters)"
                className={inputCls}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="confirm" className={labelCls}>
                Repeat new password
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                placeholder="Repeat new password"
                className={inputCls}
                autoComplete="new-password"
              />
            </div>
            {state && "error" in state && (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] font-medium leading-[1.5] text-danger">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className={`${btnPrimary} mt-1 w-full`}>
              {pending ? "Saving…" : "Save new password"}
            </button>
          </form>
        </div>
      </div>

      <Guardrails />
    </main>
  );
}
