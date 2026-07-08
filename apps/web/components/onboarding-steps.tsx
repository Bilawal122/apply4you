const STEPS = ["Upload resume", "Review profile", "Set preferences"];

/** The onboarding really is a sequence — numbering carries information here. */
export function OnboardingSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const state = step < current ? "done" : step === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${
                state === "done"
                  ? "bg-accent text-white"
                  : state === "active"
                    ? "border-2 border-accent text-accent"
                    : "border border-line text-ink-soft"
              }`}
            >
              {state === "done" ? "✓" : step}
            </span>
            <span className={`text-xs ${state === "active" ? "font-medium text-ink" : "text-ink-soft"}`}>
              {label}
            </span>
            {step < 3 && <span className="h-px w-6 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
