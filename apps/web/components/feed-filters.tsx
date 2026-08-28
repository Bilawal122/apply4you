"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Spinner, filterPill } from "@/components/ui";

const ATS = ["greenhouse", "lever", "ashby", "workable"];
const SEARCH_DEBOUNCE_MS = 300;

/*
  The controls are pills so the row reads as one segmented register header.
  The native <input>/<select>/<checkbox> underneath are untouched — a select is
  covered by a transparent, full-size native control and a checkbox is sr-only
  inside its own <label> — so keyboard, screen readers and the mobile pickers
  all behave exactly as they did before the restyle.
*/

/** inputCls at pill radius: same tokens, same focus ring, sized for this row. */
const searchCls =
  "w-full rounded-full bg-card px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-lime/50 sm:w-60";

const pillFocus =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink";

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0" aria-hidden="true">
      <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Server-applied feed filters, driven through the URL so they survive refresh. */
export function FeedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const setLocation = useCallback(
    (value: string) => {
      if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
      locationDebounceRef.current = setTimeout(() => setParam("location", value), SEARCH_DEBOUNCE_MS);
    },
    [setParam],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    };
  }, []);

  const q = params.get("q") ?? "";
  const ats = params.get("ats") ?? "";
  const minScore = params.get("minScore") ?? "";
  const remote = params.get("remote") === "1";
  const sponsored = params.get("sponsored") === "1";
  const location = params.get("location") ?? "";
  const hasFilters = q || ats || minScore || remote || sponsored || location;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        className={searchCls}
        placeholder="Search title or company"
        defaultValue={q}
        onChange={(e) => setSearch(e.target.value.trim())}
      />

      {/*
        The control the preferences form used to point at while it did not
        exist ("filter the feed by location in the meantime"). Free text rather
        than a select, because job locations are free text across four ATSs and
        any fixed list would be wrong for someone.
      */}
      <input
        className={searchCls}
        placeholder="Location"
        aria-label="Filter by location"
        defaultValue={location}
        onChange={(e) => setLocation(e.target.value.trim())}
      />

      <span className="relative inline-flex">
        <select
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Filter by job board"
          value={ats}
          onChange={(e) => setParam("ats", e.target.value)}
        >
          <option value="">All sources</option>
          {ATS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className={`${filterPill(Boolean(ats))} ${pillFocus} pointer-events-none`}>
          {ats || "All sources"}
          <Chevron />
        </span>
      </span>

      <span className="relative inline-flex">
        <select
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Minimum fit score"
          value={minScore}
          onChange={(e) => setParam("minScore", e.target.value)}
        >
          <option value="">Any fit</option>
          <option value="80">80+ fit</option>
          <option value="70">70+ fit</option>
          <option value="60">60+ fit</option>
        </select>
        <span aria-hidden="true" className={`${filterPill(Boolean(minScore))} ${pillFocus} pointer-events-none`}>
          {minScore ? `${minScore}+ fit` : "Any fit"}
          <Chevron />
        </span>
      </span>

      <label className="relative inline-flex cursor-pointer">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={remote}
          onChange={(e) => setParam("remote", e.target.checked ? "1" : "")}
        />
        <span className={`${filterPill(remote)} ${pillFocus}`}>Remote only</span>
      </label>

      <label
        className="relative inline-flex cursor-pointer"
        title="Employers holding a Home Office sponsor licence (a licence does not guarantee sponsorship for a specific role)"
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={sponsored}
          onChange={(e) => setParam("sponsored", e.target.checked ? "1" : "")}
        />
        <span className={`${filterPill(sponsored)} ${pillFocus}`}>Visa sponsor licence ✓</span>
      </label>

      {hasFilters && (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          className={filterPill(false)}
        >
          Clear
        </button>
      )}

      {isPending && (
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink-soft">
          <Spinner />
          updating…
        </span>
      )}
    </div>
  );
}
