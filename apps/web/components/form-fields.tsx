"use client";

import { useState } from "react";
import { inputCls, labelCls } from "@/components/ui";

/*
  Interactive form atoms.

  Separate from ui.tsx because these hold state, and ui.tsx is imported by
  server components — putting hooks there would force the whole design system
  into the client bundle.
*/

/** A select styled as one of our inputs, with the chevron drawn in. */
export const selectCls = `${inputCls} appearance-none bg-no-repeat pr-11`;

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%235c6169' stroke-width='1.6'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

/**
 * A text input that suggests as you type, without ever refusing what you type.
 *
 * Native `<datalist>` rather than a bespoke combobox: keyboard- and
 * screen-reader-correct for free, renders as a real picker on mobile, needs no
 * JavaScript, and — the part that matters — leaves the field free text. A
 * suggestion list that cannot describe someone must never become a list that
 * excludes them, which is exactly the risk for anyone whose job title or
 * qualification is not on a curated list.
 */
export function SuggestInput({
  id,
  options,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; options: readonly string[] }) {
  return (
    <>
      <input {...props} id={id} list={`${id}-options`} className={className ?? inputCls} autoComplete="off" />
      <datalist id={`${id}-options`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

/**
 * A closed list of choices, plus the honest admission that a list is never
 * complete. Choosing "Other" reveals a text box, and the typed value — not the
 * word "Other" — is what gets stored, so nothing downstream has to know that
 * "Other" was ever on screen.
 */
export function SelectWithOther({
  id,
  label,
  help,
  options,
  otherValue = "Other",
  value,
  onChange,
  placeholder = "Describe your situation",
}: {
  id: string;
  label: string;
  help?: string;
  options: readonly string[];
  otherValue?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  // A stored value that is non-empty and unlisted means the user is mid-"Other",
  // so the box reopens with their own text rather than silently discarding it.
  const isListed = value === "" || options.includes(value);
  const [showOther, setShowOther] = useState(!isListed);

  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      {help && <p className="mb-2.5 text-[13px] leading-[1.5] text-ink-soft">{help}</p>}
      <select
        id={id}
        className={selectCls}
        style={{ backgroundImage: CHEVRON, backgroundPosition: "right 0.95rem center", backgroundSize: "1.05rem" }}
        value={showOther ? otherValue : value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === otherValue) {
            setShowOther(true);
            onChange("");
          } else {
            setShowOther(false);
            onChange(next);
          }
        }}
      >
        <option value="">Select one…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {showOther && (
        <input
          className={`${inputCls} mt-2.5`}
          placeholder={placeholder}
          value={isListed ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} — other`}
        />
      )}
    </div>
  );
}
