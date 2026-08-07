"use client";

import { useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Spinner, btnGhost } from "@/components/ui";

/*
  Signing out is reversible and unremarkable, so it takes the borderless
  weight — never the lime, which belongs to the one irreversible action.

  btnGhost is used unmodified: it already carries its own padding and text
  size, and appending competing utilities to an atom is decided by stylesheet
  order rather than the order they're written, so the override is not reliably
  the one that wins.
*/
export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => signOut())}
      className={`${btnGhost} shrink-0`}
    >
      {pending && <Spinner />}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
