"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Field, ResolvedCv, ResolvedValues, ReviewMetrics, UnresolvedField } from "@apply4you/shared";
import {
  approveApplication,
  fillFieldWithAi,
  saveApplicationFields,
  skipApplication,
} from "@/app/(app)/applications/actions";
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
  /** fieldId -> "profile" | "library" | "ai", recorded at resolve time. */
  answerSources: Record<string, string>;
  /** The posting vanished from its board after this was queued. */
  jobClosed: boolean;
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
function TailoredCvBlock({ cv, applicationId }: { cv: ResolvedCv; applicationId: string }) {
  const [open, setOpen] = useState(false);
  const dropped = cv.omitted.roles + cv.omitted.bullets + cv.omitted.skills;

  return (
    <div className="mb-5 rounded-[3px] border border-line bg-paper p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-mono">Tailored CV</p>
        <div className="flex items-center gap-3">
          {/* The document itself, not a summary of it — same markup the worker
              turns into the PDF, so reviewing this is reviewing the artifact. */}
          <a
            href={`/api/applications/${applicationId}/cv`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent hover:underline"
          >
            open the full CV ↗
          </a>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft hover:text-ink hover:underline"
          >
            {open ? "hide" : "show what we led with"}
          </button>
        </div>
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
  // Which field is currently being drafted, and any per-field message.
  const [drafting, setDrafting] = useState<string | null>(null);
  // Fields the user asked the AI to draft. Tracked apart from `edited` because
  // accepting a machine draft is the opposite of editing machine text — folding
  // the two together would inflate the D6 edit-rate with AI output.
  const [aiDrafted, setAiDrafted] = useState<Set<string>>(new Set());

  /*
   * Review-quality instrumentation (C2 / DECISIONS.md D6). Time is accumulated
   * only while the card is actually expanded, so leaving the page open on a
   * collapsed list doesn't manufacture review time that never happened.
   */
  const openedAt = useRef<number | null>(null);
  const secondsOpen = useRef(0);
  const openedCount = useRef(0);

  useEffect(() => {
    if (expanded) {
      openedAt.current = Date.now();
      openedCount.current += 1;
    } else if (openedAt.current !== null) {
      secondsOpen.current += (Date.now() - openedAt.current) / 1000;
      openedAt.current = null;
    }
  }, [expanded]);

  const collectMetrics = (bulk = false): ReviewMetrics => {
    const live = openedAt.current !== null ? (Date.now() - openedAt.current) / 1000 : 0;
    // Accepting an AI draft is not the user editing AI text.
    const editedFields = [...edited].filter((id) => id !== "__cl" && !aiDrafted.has(id));
    return {
      openedCount: openedCount.current,
      seconds: Math.round(secondsOpen.current + live),
      fieldsEdited: editedFields.length,
      // Only counts fields the machine actually wrote — provenance comes from
      // answer_sources recorded at resolve time, never inferred here.
      aiFieldsEdited: editedFields.filter((id) => app.answerSources[id] === "ai").length,
      coverLetterEdited: edited.has("__cl"),
      bulk,
    };
  };
  const [fieldNote, setFieldNote] = useState<Record<string, string>>({});

  const draftAnswer = (fieldId: string) => {
    setDrafting(fieldId);
    setFieldNote((n) => ({ ...n, [fieldId]: "" }));
    startTransition(async () => {
      const res = await fillFieldWithAi(app.id, fieldId);
      if (res.value) {
        setValues((v) => ({ ...v, [fieldId]: res.value! }));
        setAiDrafted((a) => new Set(a).add(fieldId));
        setEdited((e) => {
          const next = new Set(e);
          next.delete(fieldId); // it is the machine's words now, not the user's
          return next;
        });
        setDirty(true);
      } else if (res.error) {
        setFieldNote((n) => ({ ...n, [fieldId]: res.error! }));
      }
      setDrafting(null);
    });
  };

  // resume_text (paste-resume textarea) and EEOC blocks are never filled by
  // the machine — hide them from review too.
  const editableFields = app.formSchema.filter(
    (f) => f.type !== "file" && !isCoverLetterField(f) && f.id !== "resume_text" && !f.id.startsWith("eeo["),
  );

  /**
   * Gaps computed from what is on screen RIGHT NOW, not from the status the
   * server last wrote.
   *
   * Before this, Approve stayed disabled while `status === "needs_review"`, and
   * status was only recomputed inside saveApplicationFields — so filling the
   * missing answer meant clicking Save, waiting for a round trip, and only then
   * being allowed to Approve. That friction landed on exactly the applications
   * needing the most human attention.
   *
   * The gate itself is untouched: approve() still saves first when dirty, and
   * approveOne still refuses any row that is not `draft` server-side. This only
   * stops the button lying about whether the user has finished.
   */
  const openRequired = editableFields.filter((f) => f.required && !String(values[f.id] ?? "").trim());
  const coverLetterMissing = Boolean(clField?.required) && !coverLetter.trim();
  const requiredGaps = openRequired.length + (coverLetterMissing ? 1 : 0);

  const setValue = (id: string, value: string) => {
    setValues((v) => ({ ...v, [id]: value }));
    setEdited((e) => new Set(e).add(id));
    setDirty(true);
  };

  /**
   * Honest provenance: only what the stored data actually supports.
   *
   * `answer_sources` is the server's own record of who wrote each answer, so it
   * outranks the "came from your profile" fallback. Without consulting it, an
   * AI-drafted answer read back after a reload was labelled PROFILE — the UI
   * contradicting a fact the database already held, on the one label whose
   * entire job is to be trustworthy.
   */
  const sourceOf = (id: string, value: string): Source => {
    if (aiDrafted.has(id)) return "ai";
    if (edited.has(id)) return "you";
    if (!value) return "unknown";
    const recorded = app.answerSources[id];
    if (recorded === "ai" || recorded === "library" || recorded === "profile") return recorded;
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
      // Save first whenever the server could still be holding `needs_review` —
      // approveOne refuses anything that isn't `draft`, and saving is what
      // recomputes the status. Not just when dirty: a gap can be closed by a
      // library answer or an AI draft that never marked the form dirty.
      const mustSyncStatus = dirty || app.status === "needs_review";
      const res = mustSyncStatus
        ? await saveApplicationFields(app.id, payload(), coverLetter || null).then((r) =>
            r.error ? r : approveApplication(app.id, collectMetrics()),
          )
        : await approveApplication(app.id, collectMetrics());
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
          {app.jobClosed ? (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-danger">
              posting closed
            </span>
          ) : requiredGaps > 0 ? (
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
          {app.jobClosed && (
            <p className="mb-4 rounded-[3px] border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-ink">
              <span className="font-medium">This posting has closed.</span> It disappeared from the
              company&apos;s job board after you queued it, so there is nothing left to send. Skip it —
              approving would spend one of your applications on a form that no longer exists.
            </p>
          )}

          {app.tailoredCv && <TailoredCvBlock cv={app.tailoredCv} applicationId={app.id} />}

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

                    {/* Drafting is opt-in per field: the resolver deliberately
                        left this blank, so the user asks for a draft rather
                        than having one appear unbidden. */}
                    <button
                      type="button"
                      onClick={() => draftAnswer(field.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-accent hover:underline disabled:opacity-40"
                    >
                      {drafting === field.id && <Spinner />}
                      {drafting === field.id ? "drafting…" : value ? "redraft with AI" : "fill with AI"}
                    </button>
                    {fieldNote[field.id] && (
                      <span className="text-[11px] leading-snug text-attention">{fieldNote[field.id]}</span>
                    )}
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
              disabled={pending || requiredGaps > 0 || app.jobClosed}
              className={btnPrimary}
              title={
                app.jobClosed
                  ? "This posting has closed — there is nothing left to submit to"
                  : requiredGaps > 0
                    ? `Still needed: ${[...openRequired.map((f) => f.label), ...(coverLetterMissing ? ["Cover letter"] : [])]
                        .slice(0, 3)
                        .join(", ")}`
                    : undefined
              }
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
