"use client";

import { useActionState, useState } from "react";
import { LIBRARY_QUESTIONS } from "@apply4you/shared";
import { saveAnswerLibrary, type SaveState } from "@/app/(app)/actions";
import { Eyebrow, NeedsYouStamp, Spinner, Tick, btnPrimary, cardCls, inputCls } from "@/components/ui";

/**
 * Answer Library (task #31) — the questions a CV can never answer.
 *
 * Everything here is optional. A blank answer is not a gap to be filled by the
 * machine: the field simply stays unanswered and the application parks for
 * review, exactly as it does today. Filling one in only ever replaces a
 * "needs you" with the user's own words.
 *
 * Presented as a register: one ruled row per question, the question and its
 * note on the left, the answer on the right. The count at the top is machine
 * output, so it is mono; the questions are ordinary prose, so they are not.
 */
export function AnswerLibraryForm({ initial }: { initial: Record<string, string> }) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAnswerLibrary, null);

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));
  const filled = LIBRARY_QUESTIONS.filter((q) => answers[q.key]?.trim()).length;
  const essentials = LIBRARY_QUESTIONS.filter((q) => q.essential);
  const optional = LIBRARY_QUESTIONS.filter((q) => !q.essential);
  const essentialsOpen = essentials.filter((q) => !answers[q.key]?.trim()).length;

  const renderRow = (q: (typeof LIBRARY_QUESTIONS)[number]) => (
          <div
            key={q.key}
            className="field-rule grid grid-cols-1 gap-x-8 gap-y-2.5 py-4 sm:grid-cols-[minmax(0,17rem)_1fr] sm:items-start"
          >
            <div className="min-w-0">
              {q.kind === "choice" && q.choices ? (
                <p id={`al-${q.key}-label`} className="text-[14px] font-semibold text-ink">
                  {q.label}
                </p>
              ) : (
                <label htmlFor={`al-${q.key}`} className="block text-[14px] font-semibold text-ink">
                  {q.label}
                </label>
              )}
              <p className="mt-1 text-[13px] leading-[1.5] text-ink-soft">{q.help}</p>
            </div>

            <div className="min-w-0">
              {q.kind === "choice" && q.choices ? (
                <div role="group" aria-labelledby={`al-${q.key}-label`} className="flex flex-wrap gap-2">
                  {q.choices.map((choice) => {
                    const active = answers[q.key] === choice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set(q.key, active ? "" : choice)}
                        className={`rounded-full border px-[15px] py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                          active
                            ? "border-transparent bg-accent-soft text-accent"
                            : "border-line bg-card text-ink-soft hover:border-ink-faint hover:text-ink"
                        }`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  id={`al-${q.key}`}
                  className={inputCls}
                  value={answers[q.key] ?? ""}
                  onChange={(e) => set(q.key, e.target.value)}
                  placeholder="Leave blank to be asked at review time"
                />
              )}
            </div>
          </div>
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      {/*
        Right to work is lifted out of the list. Every employer form asks it,
        it is always required, and no CV answers it — so a blank here is not a
        quiet "we'll ask later", it is every application parking. Still
        optional: the product never answers this for you.
      */}
      <section className={`${cardCls} px-6 py-6 sm:px-7`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Eyebrow>Right to work</Eyebrow>
          {essentialsOpen > 0 && <NeedsYouStamp>{`${essentialsOpen} unanswered`}</NeedsYouStamp>}
        </div>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-[1.6] text-ink-body">
          Almost every application asks these two, and they are always required. We will never
          answer them for you — so until you do, each form that asks comes back to you before it
          can be sent.
        </p>

        <div className="mt-5">{essentials.map(renderRow)}</div>
      </section>

      <section className={`${cardCls} px-6 py-6 sm:px-7`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Eyebrow>Answer library</Eyebrow>
          <p className="font-mono text-[11.5px] tabular-nums text-ink-soft">
            {filled} of {LIBRARY_QUESTIONS.length} answered
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-[1.6] text-ink-body">
          Answer these once and we&apos;ll reuse them on every form that asks. They&apos;re your own
          words — we never invent an answer, so anything you leave blank stays blank and comes back
          to you for review.
        </p>

        <div className="mt-5">
          {optional.map(renderRow)}
        </div>
      </section>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending && <Spinner />}
          {pending ? "Saving…" : "Save answers"}
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
