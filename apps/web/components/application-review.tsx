"use client";

import { useState, useTransition } from "react";
import type { Field, ResolvedCv, ResolvedValues, UnresolvedField } from "@apply4you/shared";
import { approveApplication, saveApplicationFields, skipApplication } from "@/app/(app)/applications/actions";
import {
  NeedsYouStamp,
  Provenance,
  Spinner,
  btnGhost,
  btnPrimary,
  btnSecondary,
  inputCls,
  type Source,
} from "@/components/ui";

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
  /** Per-job tailored CV, already resolved against the live profile (task #40). */
  tailoredCv: ResolvedCv | null;
}

function isCoverLetterField(f: Field): boolean {
  return f.type === "textarea" && /cover.?letter/i.test(`${f.id} ${f.label}`);
}

/**
 * The tailored CV, shown as what it actually is: a re-ordering of the user's
 * own experience for this job. Every line here is text they wrote — the model
 * only chose which lines and in what order (see resolveTailoredCv). So the
 * honest framing is "what we led with", not "what we generated", and the
 * omission counts are shown rather than hidden.
 */
function TailoredCvBlock({ cv }: { cv: ResolvedCv }) {
  const [open, setOpen] = useState(false);
  const dropped = cv.omitted.roles + cv.omitted.bullets + cv.omitted.skills;

  return (
    <div className="mb-5 rounded-[3px] border border-line bg-paper p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-mono">Tailored CV</p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent hover:underline"
        >
          {open ? "hide" : "show what we led with"}
        </button>
      </div>

      {cv.rationale && <p className="mt-1.5 text-[13px] text-ink">{cv.rationale}</p>}

      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
        your own wording, reordered for this job
        {dropped > 0 ? ` · ${dropped} item${dropped === 1 ? "" : "s"} held back` : ""}
      </p>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {cv.summary && <p className="mb-3 text-[13px] leading-relaxed text-ink">{cv.summary}</p>}
          {cv.roles.map((r, i) => (
            <div key={`${r.company}-${i}`} className="mb-2.5">
              <p className="text-[13px] font-medium text-ink">
                {r.title} — {r.company}
              </p>
              <ul className="mt-0.5 list-disc pl-4">
                {r.bullets.map((b, bi) => (
                  <li key={bi} className="text-[13px] text-ink-soft">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {cv.skills.length > 0 && (
            <p className="mt-2 text-[13px] text-ink-soft">
              <span className="label-mono">Skills</span> {cv.skills.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
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
  // Fields the user has touched this session, so their answers can be marked
  // as theirs rather than the machine's.
  const [edited, setEdited] = useState<Set<string>>(new Set());

  // resume_text (paste-resume textarea) and EEOC blocks are never filled by
  // the machine — hide them from review too.
  const editableFields = app.formSchema.filter(
    (f) => f.type !== "file" && !isCoverLetterField(f) && f.id !== "resume_text" && !f.id.startsWith("eeo["),
  );
  const requiredGaps = app.unresolvedFields.filter((u) => u.required && u.id !== clField?.id).length;

  const setValue = (id: string, value: string) => {
    setValues((v) => ({ ...v, [id]: value }));
    setEdited((e) => new Set(e).add(id));
    setDirty(true);
  };

  /** Honest provenance: only what the stored data actually supports. */
  const sourceOf = (id: string, value: string): Source => {
    if (edited.has(id)) return "you";
    if (!value) return "unknown";
    return "profile";
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
    <div className="rounded-[3px] border border-line bg-card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <div className="min-w-0">
          <span className="text-[15px] font-semibold text-ink">{app.jobTitle}</span>
          <span className="ml-2 text-sm text-ink-soft">{app.company}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {app.status === "needs_review" ? (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-attention">
              {requiredGaps} answer{requiredGaps === 1 ? "" : "s"} needed
            </span>
          ) : (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-accent">
              ready to send
            </span>
          )}
          <span className="font-mono text-xs text-ink-faint">{expanded ? "−" : "+"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line px-4 py-4">
          {/*
            The packet (task #40): CV, then letter, then every answer — the
            whole artifact an employer receives, in the order they'd read it.
          */}
          {app.tailoredCv && <TailoredCvBlock cv={app.tailoredCv} />}

          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="label-mono">What we&apos;ll send</p>
            <a
              href={app.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ink-soft underline decoration-line underline-offset-2 transition-colors hover:text-ink"
            >
              View the job posting ↗
            </a>
          </div>

          {/*
            Every answer is shown as a ruled register row: mono label and its
            provenance on the left, the editable value on the right. A missing
            required answer is stamped rather than silently left blank — the
            gap is the point, not an embarrassment to hide.
          */}
          <div className="flex flex-col">
            {editableFields.map((field) => {
              const value = values[field.id] ?? "";
              const missing = field.required && !value;
              const source = sourceOf(field.id, value);

              return (
                <div
                  key={field.id}
                  className="field-rule grid grid-cols-1 gap-x-6 gap-y-1.5 py-3 sm:grid-cols-[minmax(9rem,13rem)_1fr]"
                >
                  <div className="flex flex-col items-start gap-1.5">
                    {/*
                      The employer wrote this question, so it's set in sans and
                      left in its original sentence case. Forcing it through the
                      mono uppercase label style made real ATS questions — which
                      run to a full sentence — genuinely hard to read.
                    */}
                    <label className="text-[13px] leading-snug text-ink-soft" htmlFor={`f-${field.id}`}>
                      {field.label}
                      {field.required && <span className="text-attention"> *</span>}
                    </label>
                    {missing ? <NeedsYouStamp /> : <Provenance source={source} />}
                  </div>

                  <div className="min-w-0">
                    {field.type === "textarea" ? (
                      <textarea
                        id={`f-${field.id}`}
                        className={`${inputCls} ${missing ? "border-attention/50" : ""}`}
                        rows={4}
                        maxLength={field.maxLength}
                        value={value ?? ""}
                        onChange={(e) => setValue(field.id, e.target.value)}
                      />
                    ) : field.options?.length && (field.type === "select" || field.type === "radio") ? (
                      <select
                        id={`f-${field.id}`}
                        className={`${inputCls} ${missing ? "border-attention/50" : ""}`}
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
                        id={`f-${field.id}`}
                        className={`${inputCls} ${missing ? "border-attention/50" : ""}`}
                        maxLength={field.maxLength}
                        value={value ?? ""}
                        onChange={(e) => setValue(field.id, e.target.value)}
                        placeholder={
                          field.type === "multiselect" ? "Separate multiple choices with ||" : undefined
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(clField || coverLetter) && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <label className="text-[13px] font-medium text-ink" htmlFor={`cl-${app.id}`}>
                  Cover letter{clField?.required && <span className="text-attention"> *</span>}
                </label>
                <Provenance source={edited.has("__cl") ? "you" : "ai"} />
              </div>
              <textarea
                id={`cl-${app.id}`}
                className={inputCls}
                rows={8}
                maxLength={clField?.maxLength}
                value={coverLetter}
                onChange={(e) => {
                  setCoverLetter(e.target.value);
                  setEdited((s) => new Set(s).add("__cl"));
                  setDirty(true);
                }}
              />
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
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
            {message && <span className="font-mono text-xs text-ink-soft">{message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
