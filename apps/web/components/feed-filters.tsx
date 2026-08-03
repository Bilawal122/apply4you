"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Spinner, inputCls } from "@/components/ui";

const ATS = ["greenhouse", "lever", "ashby", "workable"];
const SEARCH_DEBOUNCE_MS = 300;

/** Server-applied feed filters, driven through the URL so they survive refresh. */
export function FeedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  // Search shouldn't fire a server round-trip per keystroke.
  const setSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setParam("q", value), SEARCH_DEBOUNCE_MS);
    },
    [setParam],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const q = params.get("q") ?? "";
  const ats = params.get("ats") ?? "";
  const minScore = params.get("minScore") ?? "";
  const remote = params.get("remote") === "1";
  const sponsored = params.get("sponsored") === "1";
  const hasFilters = q || ats || minScore || remote || sponsored;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        className={`${inputCls} max-w-56`}
        placeholder="Search title or company"
        defaultValue={q}
        onChange={(e) => setSearch(e.target.value.trim())}
      />
      <select className={`${inputCls} max-w-40`} value={ats} onChange={(e) => setParam("ats", e.target.value)}>
        <option value="">All sources</option>
        {ATS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        className={`${inputCls} max-w-40`}
        value={minScore}
        onChange={(e) => setParam("minScore", e.target.value)}
      >
        <option value="">Any fit</option>
        <option value="80">80+ fit</option>
        <option value="70">70+ fit</option>
        <option value="60">60+ fit</option>
      </select>
      <label className="flex items-center gap-1.5 text-sm text-ink-soft">
        <input type="checkbox" checked={remote} onChange={(e) => setParam("remote", e.target.checked ? "1" : "")} />
        Remote only
      </label>
      <label
        className="flex items-center gap-1.5 text-sm text-ink-soft"
        title="Employers holding a Home Office sponsor licence (a licence does not guarantee sponsorship for a specific role)"
      >
        <input
          type="checkbox"
          checked={sponsored}
          onChange={(e) => setParam("sponsored", e.target.checked ? "1" : "")}
        />
        Visa sponsor licence ✓
      </label>
      {hasFilters && (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          className="text-sm text-ink-soft underline transition-colors hover:text-ink"
        >
          Clear
        </button>
      )}
      {isPending && (
        <span className="flex items-center gap-1.5 font-mono text-xs text-ink-soft">
          <Spinner />
          updating…
        </span>
      )}
    </div>
  );
}
