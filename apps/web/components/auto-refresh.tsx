"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page on an interval — for "in progress" states the user shouldn't have to refresh. */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  return null;
}
