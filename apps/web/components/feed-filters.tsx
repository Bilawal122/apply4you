"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputCls } from "@/components/ui";

const ATS = ["greenhouse", "lever", "ashby", "workable"];

/** Server-applied feed filters, driven through the URL so they survive refresh. */
export function FeedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const q = params.get("q") ?? "";
  const ats = params.get("ats") ?? "";
  const minScore = params.get("minScore") ?? "";
  const remote = params.get("remote") === "1";
  const hasFilters = q || ats || minScore || remote;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        className={`${inputCls} max-w-56`}
        placeholder="Search title or company"
        defaultValue={q}
        onChange={(e) => setParam("q", e.target.value.trim())}
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
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="text-sm text-ink-soft underline hover:text-ink"
        >
          Clear
        </button>
      )}
    </div>
  );
}
