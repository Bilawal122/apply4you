"use client";

import { useActionState, useState } from "react";
import type { Preferences, WorkModel } from "@apply4you/shared";
import { savePreferences, type SaveState } from "@/app/(app)/actions";

const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const labelCls = "text-xs font-medium text-neutral-600";

const WORK_MODELS: WorkModel[] = ["remote", "hybrid", "onsite"];

function ListInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        className={inputCls}
        placeholder={placeholder}
        value={value.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
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

      <ListInput
        label="Target job titles"
        placeholder="Software Engineer, Frontend Engineer"
        value={prefs.titles}
        onChange={(v) => set("titles", v)}
      />
      <ListInput
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

      <ListInput
        label="Seniority levels"
        placeholder="Junior, Mid, Senior"
        value={prefs.seniority}
        onChange={(v) => set("seniority", v)}
      />
      <ListInput
        label="Industries (blank for all)"
        placeholder="Fintech, Healthcare"
        value={prefs.industries}
        onChange={(v) => set("industries", v)}
      />
      <ListInput
        label="Excluded companies"
        placeholder="Companies never to apply to (e.g. your current employer)"
        value={prefs.excludedCompanies}
        onChange={(v) => set("excludedCompanies", v)}
      />
      <ListInput
        label="Excluded keywords"
        placeholder="Jobs containing these words are skipped"
        value={prefs.excludedKeywords}
        onChange={(v) => set("excludedKeywords", v)}
      />

      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : redirectTo ? "Save and see your matches" : "Save preferences"}
      </button>
    </form>
  );
}
