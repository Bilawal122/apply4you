"use client";

import { useState, useTransition } from "react";
import type { Field, ResolvedValues, UnresolvedField } from "@apply4you/shared";
import { approveApplication, saveApplicationFields, skipApplication } from "@/app/(app)/applications/actions";

const inputCls = "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm";

export interface ReviewApp {
  id: string;
  status: string;
  jobTitle: string;
  company: string;
  formSchema: Field[];
  resolvedFields: ResolvedValues;
  coverLetter: string | null;
  unresolvedFields: UnresolvedField[];
}

export function ApplicationReview({ app }: { app: ReviewApp }) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<ResolvedValues>(app.resolvedFields);
  const [coverLetter, setCoverLetter] = useState(app.coverLetter ?? "");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editableFields = app.formSchema.filter((f) => f.type !== "file");
  const requiredGaps = app.unresolvedFields.filter((u) => u.required).length;

  const setValue = (id: string, value: string) => {
    setValues((v) => ({ ...v, [id]: value }));
    setDirty(true);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveApplicationFields(app.id, values, coverLetter || null);
      setMessage(res.error ?? "Saved");
      if (!res.error) setDirty(false);
    });

  const approve = () =>
    startTransition(async () => {
      const res = dirty
        ? await saveApplicationFields(app.id, values, coverLetter || null).then((r) =>
            r.error ? r : approveApplication(app.id),
          )
        : await approveApplication(app.id);
      setMessage(res.error ?? "Approved — submitting soon");
    });

  const skip = () =>
    startTransition(async () => {
      const res = await skipApplication(app.id);
      setMessage(res.error ?? "Skipped");
    });

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <span className="text-sm font-semibold">{app.jobTitle}</span>
          <span className="ml-2 text-sm text-neutral-500">{app.company}</span>
        </div>
        <div className="flex items-center gap-2">
          {app.status === "needs_review" ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {requiredGaps} answer{requiredGaps === 1 ? "" : "s"} needed
            </span>
          ) : (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Ready</span>
          )}
          <span className="text-neutral-400">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 px-4 py-4">
          <div className="flex flex-col gap-3">
            {editableFields.map((field) => {
              const value = values[field.id] ?? "";
              const missing = field.required && !value;
              return (
                <div key={field.id}>
                  <label className={`text-xs font-medium ${missing ? "text-amber-700" : "text-neutral-600"}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                    {missing ? " — needs your answer" : ""}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      className={inputCls}
                      rows={4}
                      maxLength={field.maxLength}
                      value={value ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                    />
                  ) : field.options?.length && (field.type === "select" || field.type === "radio") ? (
                    <select className={inputCls} value={value ?? ""} onChange={(e) => setValue(field.id, e.target.value)}>
                      <option value="">— not answered —</option>
                      {field.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputCls}
                      maxLength={field.maxLength}
                      value={value ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.type === "multiselect" ? "Separate multiple choices with ||" : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={pending || app.status === "needs_review"}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              title={app.status === "needs_review" ? "Fill the required answers and save first" : undefined}
            >
              Approve &amp; submit
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              Save edits
            </button>
            <button
              type="button"
              onClick={skip}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-red-600"
            >
              Skip
            </button>
            {message && <span className="text-xs text-neutral-500">{message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
