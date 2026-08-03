/*
  Shared UI atoms — "official register" system (see globals.css).

  Voice: machine output (scores, statuses, values, verdicts) is mono; human
  text is sans. Provenance: anything shown to the user can declare where it
  came from, and a refusal to guess is displayed as proudly as an answer.
*/

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-[3px] bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-100 hover:bg-accent-deep active:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none";

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-[3px] border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors duration-100 hover:border-ink-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-[3px] px-3 py-2 text-sm font-medium text-ink-soft transition-colors duration-100 hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none";

/** Inline pending indicator for buttons — sized to the text line. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export const inputCls =
  "w-full rounded-[3px] border border-line bg-card px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";

/** Form-field label — mono, tracked, uppercase. The system's connective tissue. */
export const labelCls = "label-mono mb-1.5 block";

export const cardCls = "rounded-[3px] border border-line bg-card";

/** Section eyebrow: the same label texture, used above a block of content. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`label-mono ${className}`}>{children}</p>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "border-accent/25 bg-accent-soft text-accent",
  needs_review: "border-attention/30 bg-attention-soft text-attention",
  approved: "border-accent/25 bg-accent-soft text-accent",
  submitting: "border-accent/25 bg-accent-soft text-accent",
  submitted: "border-accent bg-accent text-white",
  failed: "border-danger/30 bg-danger-soft text-danger",
  skipped: "border-line bg-paper text-ink-soft",
  needs_manual_verification: "border-danger/30 bg-danger-soft text-danger",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "ready",
  needs_review: "needs you",
  approved: "approved",
  submitting: "submitting",
  submitted: "submitted",
  failed: "failed",
  skipped: "skipped",
  needs_manual_verification: "verify manually",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${
        STATUS_STYLES[status] ?? "border-line bg-paper text-ink-soft"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * Sponsor-licence badge (DECISIONS.md D5 conservative labeling: the employer
 * HOLDS a licence on the register date — never "sponsors this role").
 * Renders nothing when there's no verdict: absence of a match is not a claim.
 */
export function SponsorBadge({
  verdict,
}: {
  verdict: { licensed: boolean; org_name?: string; routes?: string[]; register_date?: string } | null;
}) {
  if (!verdict?.licensed) return null;
  const skilledWorker = verdict.routes?.includes("Skilled Worker");
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[2px] border border-accent/25 bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-accent"
      title={`${verdict.org_name ?? "This employer"} holds a Home Office sponsor licence${
        skilledWorker ? " (Skilled Worker route)" : ""
      } — register as of ${verdict.register_date ?? "latest refresh"}. A licence does not guarantee sponsorship for this specific role.`}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
        <path d="M2.5 6.2l2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      </svg>
      {skilledWorker ? "sponsor licence · skilled worker" : "sponsor licence"}
    </span>
  );
}

/**
 * Fit score as a register measurement: a right-aligned tabular number, full
 * stop. An earlier version put a progress bar under it, which read as an
 * underline rather than a gauge and couldn't distinguish 79 from 80 anyway —
 * a sorted column of tabular numerals scans better than either.
 */
export function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="w-9 shrink-0 pt-px text-right font-mono text-[17px] font-semibold leading-none tabular-nums text-ink"
      title={`Fit score ${score} out of 100`}
    >
      {score}
    </span>
  );
}

/**
 * PROVENANCE — the signature of this design system.
 *
 * Every value a user sees in an application can say where it came from. This
 * is the product's entire trust argument made visible: competitors show you
 * how much was filled in automatically, we show you *who wrote each thing*,
 * including the fields nobody has answered yet.
 */
/*
 * Only four states, because only four are honestly derivable from what we
 * store. We deliberately do NOT distinguish "typed from your CV" from "chosen
 * by the model from your CV" on ordinary fields — the resolver doesn't record
 * which path filled each one, and inventing that distinction would be exactly
 * the kind of confident guess this product refuses to make.
 */
export type Source = "profile" | "ai" | "you" | "unknown";

const SOURCE_COPY: Record<Source, { label: string; cls: string }> = {
  profile: { label: "from your profile", cls: "text-ink-faint" },
  ai: { label: "written by AI", cls: "text-accent" },
  you: { label: "you wrote this", cls: "text-ink-soft" },
  unknown: { label: "needs you", cls: "text-attention" },
};

export function Provenance({ source }: { source: Source }) {
  const { label, cls } = SOURCE_COPY[source];
  return (
    <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${cls}`}>{label}</span>
  );
}

/**
 * The honest blank. When the machine had no profile-backed answer it says so
 * here, in the vocabulary of the form it's filling — a stamp. This is the one
 * place the system allows itself a flourish, and the reason it earns it is
 * that admitting the gap *is* the product.
 */
export function NeedsYouStamp({ children = "needs your answer" }: { children?: React.ReactNode }) {
  return <span className="stamp text-attention">{children}</span>;
}

/**
 * A single ruled row from a register: mono label on the left, value on the
 * right. The atomic unit of every detail view in the app.
 */
export function FieldRow({
  label,
  children,
  source,
}: {
  label: string;
  children: React.ReactNode;
  source?: Source;
}) {
  return (
    <div className="field-rule grid grid-cols-1 gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[minmax(9rem,14rem)_1fr]">
      <div className="flex flex-col gap-0.5">
        <span className="label-mono">{label}</span>
        {source && <Provenance source={source} />}
      </div>
      <div className="min-w-0 text-sm text-ink">{children}</div>
    </div>
  );
}
