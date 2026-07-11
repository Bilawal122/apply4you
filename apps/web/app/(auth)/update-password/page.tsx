"use client";

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "../actions";
import { btnPrimary, inputCls } from "@/components/ui";

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState<UpdatePasswordState, FormData>(updatePassword, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-accent">Apply4You</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Choose a new password</h1>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="New password (8+ characters)"
          className={inputCls}
          autoComplete="new-password"
        />
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          placeholder="Repeat new password"
          className={inputCls}
          autoComplete="new-password"
        />
        {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </main>
  );
}
