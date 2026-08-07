const STEPS = ["Upload resume", "Review profile", "Set preferences", "Meet your matches"];

/**
 * The onboarding really is a sequence — numbering carries information here.
 *
 * So the indicator is mono: it reports machine state, not prose. Steps behind
 * you are dark pills, the step you're on is the lime affirmative, the ones
 * ahead are blank paper, and short hairlines join them into one rail.
 *
 * `className` only exists so a caller can own the spacing under the rail (the
 * onboarding page runs it as a top bar); it defaults to the margin every
 * existing caller already relied on.
 */
export function OnboardingSteps({
  current,
  className = "mb-8",
}: {
  current: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <nav aria-label="Onboarding progress" className={`overflow-x-auto ${className}`}>
      <ol className="flex w-max min-w-full items-center justify-center gap-2">
        {STEPS.map((label, i) => {
          const step = (i + 1) as 1 | 2 | 3 | 4;
          const state = step < current ? "done" : step === current ? "active" : "todo";
          return (
            <li
              key={label}
              className="flex items-center gap-2"
              aria-current={state === "active" ? "step" : undefined}
            >
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-[7px] font-mono text-[11.5px] leading-none ${
                  state === "done"
                    ? "bg-ink text-white"
                    : state === "active"
                      ? "bg-lime font-medium text-lime-ink"
                      : "bg-card text-ink-soft"
                }`}
              >
                {step} · {label}
                <span className="sr-only">
                  {state === "done" ? "(done)" : state === "active" ? "(current step)" : "(not started)"}
                </span>
              </span>
              {step < STEPS.length && (
                <span aria-hidden="true" className="h-px w-[22px] shrink-0 bg-line" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
