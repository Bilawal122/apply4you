"use client";

import { useState, useTransition } from "react";
import type { Field, ResolvedValues, UnresolvedField } from "@apply4you/shared";
import { approveApplication, saveApplicationFields, skipApplication } from "@/app/(app)/applications/actions";
import { Spinner, btnGhost, btnPrimary, btnSecondary, inputCls } from "@/components/ui";

export interface ReviewApp {
  id: string;
  status: string;
  jobTitle: string;
  company: string;
  applyUrl: string;
  formSchema: Field[];
  resolvedFields: ResolvedValues;
  coverLetter: string | null;
  unresolvedFields: UnresolvedField[];
}

function isCoverLetterField(f: Field): boolean {
  return f.type === "textarea" && /cover.?letter/i.test(`${f.id} ${f.label}`);
}

export function ApplicationReview({ app }: { app: ReviewApp }) {
  const clField = app.formSchema.find(isCoverLetterField);
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<ResolvedValues>(app.resolvedFields);
  const [coverLetter, setCoverLetter] = useState(
    app.coverLetter || (clField ? (app.resolvedFields[clField.id] ?? "") : ""),
  );
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Which button was clicked — so the pressed one shows its own spinner/label
  // while all three stay disabled.
  const [acting, setActing] = useState<"approve" | "save" | "skip" | null>(null);

  // resume_text (paste-resume textarea) and EEOC blocks are never filled by
  // the machine — hide them from review too.
  const editableFields = app.formSchema.filter(
    (f) => f.type !== "file" && !isCoverLetterField(f) && f.id !== "resume_text" && !f.id.startsWith("eeo["),
  );
  const requiredGaps = app.unresolvedFields.filter((u) => u.required && u.id !== clField?.id).length;

  const setValue = (id: string, value: string) => {
    setValues((v) => ({ ...v, [id]: value }));
    setDirty(true);
  };

  const payload = (): ResolvedValues =>
    clField ? { ...values, [clField.id]: coverLetter || null } : values;

  const save = () => {
    setActing("save");
    startTransition(async () => {
      const res = await saveApplicationFields(app.id, payload(), coverLetter || null);
      setMessage(res.error ?? "Saved");
      if (!res.error) setDirty(false);
      setActing(null);
    });
  };

  const approve = () => {
    setActing("approve");
    startTransition(async () => {
      const res = dirty
        ? await saveApplicationFields(app.id, payload(), coverLetter || null).then((r) =>
            r.error ? r : approveApplication(app.id),
          )
        : await approveApplication(app.id);
      setMessage(res.error ?? "Approved — submitting soon");
      setActing(null);
    });
  };

  const skip = () => {
    setActing("skip");
    startTransition(async () => {
      const res = await skipApplication(app.id);
      setMessage(res.error ?? "Skipped");
      setActing(null);
    });
  };

  return (
    <div className="rounded-lg border border-line bg-card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-paper/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <div className="min-w-0">
          <span className="text-sm font-semibold text-ink">{app.jobTitle}</span>
          <span className="ml-2 text-sm text-ink-soft">{app.company}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {app.status === "needs_review" ? (
            <span className="rounded bg-attention-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-attention">
              {requiredGaps} answer{requiredGaps === 1 ? "" : "s"} needed
            </span>
          ) : (
            <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">
              ready
            </span>
          )}
          <span className="text-ink-soft">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line px-4 py-4">
          <a
            href={app.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-4 inline-block text-xs text-ink-soft underline decoration-line hover:text-ink"
          >
            View the job posting
          </a>

          <div className="flex flex-col gap-3">
            {editableFields.map((field) => {
              const value = values[field.id] ?? "";
              const missing = field.required && !value;
              return (
                <div key={field.id}>
                  <label className={`text-xs font-medium ${missing ? "text-attention" : "text-ink-soft"}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                    {missing ? " — needs your answer" : ""}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      className={`${inputCls} font-mono text-xs`}
                      rows={4}
                      maxLength={field.maxLength}
                      value={value ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                    />
                  ) : field.options?.length && (field.type === "select" || field.type === "radio") ? (
                    <select
                      className={`${inputCls} font-mono text-xs`}
                      value={value ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                    >
                      <option value="">— not answered —</option>
                      {field.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={`${inputCls} font-mono text-xs`}
                      maxLength={field.maxLength}
                      value={value ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.type === "multiselect" ? "Separate multiple choices with ||" : undefined}
                    />
                  )}
                </div>
              );
            })}

            {(clField || coverLetter) && (
              <div className="rounded-md border border-line bg-paper p-3">
                <label className="text-xs font-medium text-ink-soft">
                  Cover letter {clField?.required ? "*" : "(sent with this application)"}
                </label>
                <textarea
                  className={`${inputCls} mt-1 font-mono text-xs`}
                  rows={8}
                  maxLength={clField?.maxLength}
                  value={coverLetter}
                  onChange={(e) => {
                    setCoverLetter(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={pending || app.status === "needs_review"}
              className={btnPrimary}
              title={app.status === "needs_review" ? "Fill the required answers and save first" : undefined}
            >
              {acting === "approve" && <Spinner />}
              {acting === "approve" ? "Approving…" : "Approve & submit"}
            </button>
            <button type="button" onClick={save} disabled={pending || !dirty} className={btnSecondary}>
              {acting === "save" && <Spinner />}
              {acting === "save" ? "Saving…" : "Save edits"}
            </button>
            <button type="button" onClick={skip} disabled={pending} className={`${btnGhost} hover:text-danger`}>
              {acting === "skip" && <Spinner />}
              {acting === "skip" ? "Skipping…" : "Skip"}
            </button>
            {message && <span className="text-xs text-ink-soft">{message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
