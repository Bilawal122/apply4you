"use client";

import { useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Spinner, btnGhost } from "@/components/ui";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => signOut())}
      className={`${btnGhost} px-2 py-1 text-sm`}
    >
      {pending && <Spinner />}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
