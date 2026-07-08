/* Shared UI atoms. Machine output (scores, statuses, values) is always mono. */

export const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none";

export const btnSecondary =
  "inline-flex items-center justify-center rounded-md border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40";

export const inputCls =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export const labelCls = "mb-1 block text-xs font-medium text-ink-soft";

export const cardCls = "rounded-lg border border-line bg-card";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-accent-soft text-accent",
  needs_review: "bg-attention-soft text-attention",
  approved: "bg-accent-soft text-accent",
  submitting: "bg-accent-soft text-accent",
  submitted: "bg-accent text-white",
  failed: "bg-danger-soft text-danger",
  skipped: "bg-paper text-ink-soft",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "ready",
  needs_review: "needs you",
  approved: "approved",
  submitting: "submitting",
  submitted: "submitted",
  failed: "failed",
  skipped: "skipped",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium lowercase tracking-wide ${STATUS_STYLES[status] ?? "bg-paper text-ink-soft"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Fit score: mono number + a thin bar. The machine's verdict, legible at a glance. */
export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex w-11 shrink-0 flex-col items-center gap-0.5" title={`Fit score ${score}/100`}>
      <span className="font-mono text-sm font-semibold tabular-nums text-ink">{score}</span>
      <span className="h-0.5 w-9 overflow-hidden rounded-full bg-line">
        <span className="block h-full bg-accent" style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}
