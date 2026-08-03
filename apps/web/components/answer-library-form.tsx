"use client";

import { useActionState, useState } from "react";
import { LIBRARY_QUESTIONS } from "@apply4you/shared";
import { saveAnswerLibrary, type SaveState } from "@/app/(app)/actions";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

/**
 * Answer Library (task #31) — the questions a CV can never answer.
 *
 * Everything here is optional. A blank answer is not a gap to be filled by the
 * machine: the field simply stays unanswered and the application parks for
 * review, exactly as it does today. Filling one in only ever replaces a
 * "needs you" with the user's own words.
 */
export function AnswerLibraryForm({ initial }: { initial: Record<string, string> }) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAnswerLibrary, null);

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));
  const filled = LIBRARY_QUESTIONS.filter((q) => answers[q.key]?.trim()).length;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      <div className="rounded-[3px] border border-line bg-paper p-3">
        <p className="label-mono">
          {filled} of {LIBRARY_QUESTIONS.length} answered
        </p>
        <p className="mt-1.5 text-[13px] text-ink-soft">
          Answer these once and we&apos;ll reuse them on every form that asks. They&apos;re your own
          words — we never invent an answer, so anything you leave blank stays blank and comes back
          to you for review.
        </p>
      </div>

      {LIBRARY_QUESTIONS.map((q) => (
        <section key={q.key}>
          <label className={labelCls} htmlFor={`al-${q.key}`}>
            {q.label}
          </label>
          <p className="mb-1.5 text-xs text-ink-soft">{q.help}</p>

          {q.kind === "choice" && q.choices ? (
            <div className="flex flex-wrap gap-2">
              {q.choices.map((choice) => {
                const active = answers[q.key] === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => set(q.key, active ? "" : choice)}
                    className={`rounded-[3px] border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-line bg-card text-ink-soft hover:border-ink-soft hover:text-ink"
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
        </section>
      ))}

      {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-accent">Saved.</p>}

      <button type="submit" disabled={pending} className={`${btnPrimary} self-start`}>
        {pending ? "Saving…" : "Save answers"}
      </button>
    </form>
  );
}
