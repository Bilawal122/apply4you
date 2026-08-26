"use client";

import { useActionState, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Preferences, WorkModel } from "@apply4you/shared";
import { savePreferences, type SaveState } from "@/app/(app)/actions";
import { Eyebrow, Spinner, Tick, btnPrimary, cardCls, inputCls, labelCls } from "@/components/ui";

const WORK_MODELS: WorkModel[] = ["remote", "hybrid", "onsite"];

/**
 * Keyword-chip input (VISION.md §2b — "select jobs by keywords"). Replaces
 * the old comma-text ListInput: type a term, press Enter/comma to add it as
 * a removable chip. Same onChange(string[]) contract as before, so every
 * list-style preference field upgrades uniformly.
 *
 * Visually the chips are now pills on paper tint and the field itself is the
 * dashed "+ Add" affordance at the end of the row — it is still a real text
 * input, so typing, Enter/comma, blur-commit and backspace-to-delete all work
 * exactly as they did.
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
  const inputId = useId();

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
      <label htmlFor={inputId} className={labelCls}>
        {label}
      </label>
      {hint && <p className="mb-2.5 text-[13px] leading-[1.5] text-ink-soft">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {value.map((term, i) => (
          <span
            key={`${term}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-paper-tint py-2 pl-[15px] pr-2.5 text-[13.5px] font-semibold text-ink"
          >
            {term}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[12px] leading-none text-ink-faint transition-colors hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
              aria-label={`Remove ${term}`}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          id={inputId}
          className="min-w-[9.5rem] flex-1 rounded-full border border-dashed border-line bg-card px-[15px] py-2 text-[13.5px] text-ink transition-colors placeholder:text-ink-soft focus:border-solid focus:border-ink-faint focus:outline-none focus:ring-2 focus:ring-lime/50"
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

/**
 * A preference expressed as a switch. The control is a real checkbox — kept
 * visually hidden but focusable, labelled and submitted — and the pill is
 * drawn from its :checked state, so keyboard and screen-reader behaviour is
 * the browser's, not a reimplementation.
 */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: ReactNode;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="field-rule flex cursor-pointer items-center justify-between gap-5 py-3.5">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13.5px] leading-[1.45] text-ink-soft">{description}</span>
        )}
      </span>
      <span className="relative inline-flex h-[27px] w-[46px] shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-lime peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[3px] top-[3px] h-[21px] w-[21px] rounded-full bg-ink-faint transition duration-150 peer-checked:translate-x-[19px] peer-checked:bg-ink"
        />
      </span>
    </label>
  );
}

export function PreferencesForm({ initial, redirectTo }: { initial: Preferences; redirectTo?: string }) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(savePreferences, null);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="preferences" value={JSON.stringify(prefs)} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <section className={`${cardCls} px-6 py-6 sm:px-7`}>
        <Eyebrow>What to apply to</Eyebrow>

        {/*
          First, because for this product's core user it is the question that
          decides whether every other answer matters. It is a boost in ranking
          and a hard exclusion in the auto-queue — see packages/shared/matching.
        */}
        <div className="mt-5 border-b border-line-soft pb-2">
          <ToggleRow
            label="I need UK visa sponsorship"
            description="Prioritises employers on the Home Office register of licensed sponsors, and keeps unlicensed ones out of anything queued for you automatically. A licence means an employer can sponsor — never that this role is sponsored."
            checked={prefs.needsSponsorship}
            onChange={(checked) => set("needsSponsorship", checked)}
          />
        </div>

        <div className="mt-5 flex flex-col gap-6">
          <ChipInput
            label="Target job titles — your keywords"
            hint="The AI matches every open job against these by meaning, not just exact text — add a few and it'll catch close variants too."
            placeholder="Paralegal, Customer Service Advisor, Software Engineer"
            value={prefs.titles}
            onChange={(v) => set("titles", v)}
          />
          <ChipInput
            label="Locations — not used for matching yet"
            hint="Stored for later. Ranking currently uses titles, seniority, industries, skills and your CV — filter the feed by location in the meantime."
            placeholder="London, Manchester, Remote (UK)"
            value={prefs.locations}
            onChange={(v) => set("locations", v)}
          />
          <ChipInput
            label="Seniority levels"
            placeholder="Junior, Mid, Senior"
            value={prefs.seniority}
            onChange={(v) => set("seniority", v)}
          />
          <ChipInput
            label="Industries (blank for all)"
            placeholder="Legal, Healthcare, Retail, Fintech"
            value={prefs.industries}
            onChange={(v) => set("industries", v)}
          />
        </div>

        <div className="mt-7 border-t border-line-soft pt-5">
          <p className={labelCls}>Work model — not used for matching yet</p>
          <div className="mt-0.5">
            {WORK_MODELS.map((m) => (
              <ToggleRow
                key={m}
                label={<span className="capitalize">{m}</span>}
                checked={prefs.workModel.includes(m)}
                onChange={(checked) =>
                  set("workModel", checked ? [...prefs.workModel, m] : prefs.workModel.filter((x) => x !== m))
                }
              />
            ))}
          </div>
        </div>

        {/*
          Not a control, and deliberately so: nothing in this product sends an
          application without a human approving it (DECISIONS.md D3/D6). The row
          exists to say that out loud in the place a user would go looking for
          the switch — so it is drawn permanently off and is inert markup, never
          a disabled input pretending to be one.
        */}
        <div className="mt-6 border-t border-line-soft pt-4">
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink-soft">Send without asking me</p>
              <p className="mt-0.5 text-[13.5px] leading-[1.45] text-ink-soft">
                Not available. Every submission needs a human.
              </p>
            </div>
            <span
              aria-hidden="true"
              className="relative inline-flex h-[27px] w-[46px] shrink-0 rounded-full bg-line"
            >
              <span className="absolute left-[3px] top-[3px] h-[21px] w-[21px] rounded-full bg-ink-faint" />
            </span>
          </div>
        </div>
      </section>

      <section className={`${cardCls} px-6 py-6 sm:px-7`}>
        <Eyebrow>Limits and exclusions</Eyebrow>

        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:items-end">
          <div>
            <label htmlFor="pref-salary-floor" className={labelCls}>
              Salary floor — not used for matching yet
            </label>
            <p className="mb-2.5 text-[13px] leading-[1.5] text-ink-soft">
              Most employers publish no salary at all (Greenhouse and Workable expose none), so
              filtering on it would hide almost everything. Shown on a job when the employer states it.
            </p>
            <input
              id="pref-salary-floor"
              className={inputCls}
              type="number"
              min={0}
              value={prefs.salaryFloor ?? ""}
              onChange={(e) => set("salaryFloor", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="pref-daily-cap" className={labelCls}>
              Daily application cap
            </label>
            <input
              id="pref-daily-cap"
              className={inputCls}
              type="number"
              min={1}
              max={100}
              value={prefs.dailyCap}
              onChange={(e) => set("dailyCap", Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6">
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
        </div>
      </section>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending && <Spinner />}
          {pending ? "Saving…" : redirectTo ? "Save and see your matches" : "Save preferences"}
        </button>

        {state && "error" in state && (
          <p role="status" className="text-[13.5px] text-danger">
            {state.error}
          </p>
        )}
        {state && "ok" in state && (
          <p role="status" className="inline-flex items-center gap-1.5 font-mono text-[12px] text-accent">
            <Tick />
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
