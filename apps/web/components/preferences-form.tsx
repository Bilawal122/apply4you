"use client";

import { useActionState, useState, type KeyboardEvent } from "react";
import type { Preferences, WorkModel } from "@apply4you/shared";
import { savePreferences, type SaveState } from "@/app/(app)/actions";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

const WORK_MODELS: WorkModel[] = ["remote", "hybrid", "onsite"];

/**
 * Keyword-chip input (VISION.md §2b — "select jobs by keywords"). Replaces
 * the old comma-text ListInput: type a term, press Enter/comma to add it as
 * a removable chip. Same onChange(string[]) contract as before, so every
 * list-style preference field upgrades uniformly.
 */
function ChipInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const term = raw.trim();
    if (!term) return;
    if (!value.some((v) => v.toLowerCase() === term.toLowerCase())) onChange([...value, term]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      {hint && <p className="mb-1 text-xs text-ink-soft">{hint}</p>}
      <div className={`${inputCls} flex flex-wrap items-center gap-1.5 py-1.5`}>
        {value.map((term, i) => (
          <span
            key={`${term}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
          >
            {term}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="text-accent/70 hover:text-accent"
              aria-label={`Remove ${term}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-32 flex-1 border-none bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink-soft/60"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? placeholder : "Add another…"}
        />
      </div>
    </div>
  );
}

export function PreferencesForm({ initial, redirectTo }: { initial: Preferences; redirectTo?: string }) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(savePreferences, null);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="preferences" value={JSON.stringify(prefs)} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <ChipInput
        label="Target job titles — your keywords"
        hint="The AI matches every open job against these by meaning, not just exact text — add a few and it'll catch close variants too."
        placeholder="Software Engineer, Frontend Engineer"
        value={prefs.titles}
        onChange={(v) => set("titles", v)}
      />
      <ChipInput
        label="Locations"
        placeholder="San Francisco, New York, Remote"
        value={prefs.locations}
        onChange={(v) => set("locations", v)}
      />

      <div>
        <label className={labelCls}>Work model</label>
        <div className="mt-1 flex gap-4">
          {WORK_MODELS.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={prefs.workModel.includes(m)}
                onChange={(e) =>
                  set("workModel", e.target.checked ? [...prefs.workModel, m] : prefs.workModel.filter((x) => x !== m))
                }
              />
              {m}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Salary floor (USD/year, blank for none)</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={prefs.salaryFloor ?? ""}
            onChange={(e) => set("salaryFloor", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelCls}>Daily application cap</label>
          <input
            className={inputCls}
            type="number"
            min={1}
            max={100}
            value={prefs.dailyCap}
            onChange={(e) => set("dailyCap", Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          />
        </div>
      </div>

      <ChipInput
        label="Seniority levels"
        placeholder="Junior, Mid, Senior"
        value={prefs.seniority}
        onChange={(v) => set("seniority", v)}
      />
      <ChipInput
        label="Industries (blank for all)"
        placeholder="Fintech, Healthcare"
        value={prefs.industries}
        onChange={(v) => set("industries", v)}
      />
      <ChipInput
        label="Excluded companies"
        placeholder="Companies never to apply to (e.g. your current employer)"
        value={prefs.excludedCompanies}
        onChange={(v) => set("excludedCompanies", v)}
      />
      <ChipInput
        label="Excluded keywords"
        placeholder="Jobs containing these words are skipped"
        value={prefs.excludedKeywords}
        onChange={(v) => set("excludedKeywords", v)}
      />

      {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-accent">Saved.</p>}

      <button type="submit" disabled={pending} className={`${btnPrimary} self-start`}>
        {pending ? "Saving…" : redirectTo ? "Save and see your matches" : "Save preferences"}
      </button>
    </form>
  );
}
