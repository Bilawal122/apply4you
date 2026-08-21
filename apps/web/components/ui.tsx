/*
  Shared UI atoms — "soft register" system (see globals.css).

  Voice: machine output (scores, statuses, values, verdicts) is mono; human
  text is sans. Provenance: anything shown to the user can declare where it
  came from, and a refusal to guess is displayed as proudly as an answer.

  Shape: everything that can be pressed is a full pill; everything that holds
  content is a 22px white card sitting on warm paper, with no border — the
  paper/card contrast does the work a hairline used to. Rules survive only
  *inside* a card, separating rows.
*/

import Link from "next/link";

/* ── Identity ─────────────────────────────────────────────────────────────
   Three circles: two ink, one lime. It lives here rather than in each page
   because it was independently re-typed in seven files during the redesign
   and /check was quietly left on the old mark — exactly the divergence a
   shared atom prevents.                                                    */

export function Logo({ tone = "ink" }: { tone?: "ink" | "paper" }) {
  const solid = tone === "ink" ? "var(--color-ink)" : "var(--color-paper)";
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <circle cx="4" cy="9" r="3.4" fill={solid} />
      <circle cx="13" cy="5" r="2.2" fill="var(--color-lime)" />
      <circle cx="13.5" cy="13" r="2.2" fill={solid} />
    </svg>
  );
}

/** The mark plus the wordmark, as a link. `href` varies: "/" out here, "/feed" inside. */
export function Wordmark({
  href = "/",
  tone = "ink",
  className = "",
}: {
  href?: string;
  tone?: "ink" | "paper";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-2.5 text-[18px] font-extrabold tracking-[-0.03em] ${
        tone === "ink" ? "text-ink" : "text-on-slate"
      } ${className}`}
    >
      <Logo tone={tone} />
      apply4you
    </Link>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────────
   Three weights, and the choice between them is semantic:
     primary  — the dark pill. Navigation and commitment ("Fill this one").
     lime     — the affirmative. Reserved for approving/sending, so that the
                one irreversible action in the product is the one colour the
                eye lands on first. Do not use it for "next".
     secondary— outlined. Everything reversible.
   `*Sm` variants are for row-level actions inside a table or card.        */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 disabled:pointer-events-none";

export const btnPrimary = `${btnBase} bg-ink px-6 py-3.5 text-[15px] text-white hover:bg-slate-raised active:bg-slate-raised`;

export const btnPrimarySm = `${btnBase} bg-ink px-[18px] py-2.5 text-[13.5px] text-white hover:bg-slate-raised active:bg-slate-raised`;

/** The affirmative. Approve, submit, send — nothing else. */
export const btnLime = `${btnBase} bg-lime px-7 py-3.5 text-[15px] font-bold text-ink hover:brightness-[0.96] active:brightness-[0.93]`;

export const btnLimeSm = `${btnBase} bg-lime px-[18px] py-2.5 text-[13.5px] font-bold text-ink hover:brightness-[0.96] active:brightness-[0.93]`;

export const btnSecondary = `${btnBase} border border-line bg-card px-5 py-3.5 text-[15px] text-ink hover:border-ink-faint hover:bg-paper-tint`;

export const btnSecondarySm = `${btnBase} border border-line bg-card px-[18px] py-2.5 text-[13.5px] text-ink hover:border-ink-faint hover:bg-paper-tint`;

export const btnGhost = `${btnBase} px-4 py-2.5 text-[14px] text-ink-soft hover:bg-paper-tint hover:text-ink`;

/** An underlined text action — the design's "Edit" / "Receipt" / "Review all". */
export const btnLink =
  "text-[13.5px] font-semibold text-ink underline underline-offset-2 transition-colors hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 disabled:pointer-events-none";

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

/* ── Surfaces ─────────────────────────────────────────────────────────── */

export const inputCls =
  "w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-ink-faint focus:border-ink-faint focus:outline-none focus:ring-2 focus:ring-lime/50";

/** Form-field label — mono, tracked, uppercase. The system's connective tissue. */
export const labelCls = "label-mono mb-2 block";

/** The default container: white, soft, borderless, floating on paper. */
export const cardCls = "rounded-[22px] bg-card";

/** The inverted container. Used for anything live, and for the guardrails. */
export const cardDarkCls = "rounded-[22px] bg-slate text-on-slate";

/** A recessed inset *inside* a card — quotes, drafts, secondary blocks. */
export const insetCls = "rounded-xl bg-paper-tint";

/** Section eyebrow: the same label texture, used above a block of content. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`label-mono ${className}`}>{children}</p>;
}

/** Filter / segmented control pill, as on the feed and applications screens. */
export function filterPill(active: boolean) {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-full px-[18px] py-2.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    active ? "bg-ink text-white" : "bg-card text-ink hover:bg-paper-tint"
  }`;
}

/* ── Machine marks ────────────────────────────────────────────────────── */

/** The lime tick. The single affirmative glyph in the system. */
export function Tick({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden="true">
      <circle cx="6" cy="6" r="6" fill="var(--color-lime)" />
      <path
        d="M3.2 6.1l2 2 3.6-3.9"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The hollow counterpart: a thing that is simply absent, not a failure. */
export function Hollow({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden="true">
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="var(--color-ink-faint)" strokeWidth="1.6" />
    </svg>
  );
}

const chipBase =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11.5px] leading-none";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-paper-tint text-ink-body",
  needs_review: "bg-attention-mid text-attention",
  approved: "bg-accent-soft text-accent",
  submitting: "bg-accent-soft text-accent",
  submitted: "bg-accent-soft text-accent",
  failed: "bg-danger-soft text-danger",
  skipped: "bg-paper-tint text-ink-soft",
  needs_manual_verification: "bg-danger-soft text-danger",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "ready",
  needs_review: "needs you",
  approved: "approved",
  submitting: "submitting",
  submitted: "sent",
  failed: "failed",
  skipped: "skipped",
  needs_manual_verification: "verify manually",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${chipBase} ${STATUS_STYLES[status] ?? "bg-paper-tint text-ink-soft"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** A neutral fact chip — ATS name, question count, anything unweighted. */
export function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`${chipBase} bg-paper-tint text-ink-body ${className}`}>{children}</span>;
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
      className={`${chipBase} bg-accent-soft text-accent`}
      title={`${verdict.org_name ?? "This employer"} holds a Home Office sponsor licence${
        skilledWorker ? " (Skilled Worker route)" : ""
      } — register as of ${verdict.register_date ?? "latest refresh"}. A licence does not guarantee sponsorship for this specific role.`}
    >
      {skilledWorker ? "licence held · skilled worker" : "licence held"}
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
      className="w-11 shrink-0 text-right font-mono text-[19px] leading-none tabular-nums text-ink"
      title={`Fit score ${score} out of 100`}
    >
      {score}
    </span>
  );
}

/**
 * The same score as a dial, for the one place there's room for it: a job's own
 * page, where the number is the headline rather than a sortable column.
 */
export function ScoreDial({ score, size = 64 }: { score: number; size?: number }) {
  const circumference = 2 * Math.PI * 27; // r=27 in the 66-unit viewBox
  const filled = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 66 66" aria-hidden="true">
        <circle cx="33" cy="33" r="27" fill="none" stroke="var(--color-line-soft)" strokeWidth="7" />
        <circle
          cx="33"
          cy="33"
          r="27"
          fill="none"
          stroke="var(--color-lime)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          transform="rotate(-90 33 33)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[17px] tabular-nums text-ink">{score}</span>
      </div>
      <span className="sr-only">Fit score {score} out of 100</span>
    </div>
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
export type Source = "profile" | "library" | "ai" | "you" | "unknown" | "unrecorded";

const SOURCE_COPY: Record<Source, { label: string; cls: string }> = {
  profile: { label: "from your profile", cls: "text-ink-soft" },
  // The Answer Library holds answers this user wrote themselves on an earlier
  // application. Calling that "from your profile" would misattribute their own
  // words, and calling it "written by AI" would be plainly false.
  library: { label: "your saved answer", cls: "text-ink-soft" },
  ai: { label: "drafted by AI · edit freely", cls: "text-accent" },
  you: { label: "you wrote this", cls: "text-ink-soft" },
  unknown: { label: "we didn't guess", cls: "text-attention" },
  // A value with no recorded author. DESIGN.md allows only states that are
  // honestly derivable from what we store, and this is one of them: packets
  // resolved before answer_sources existed carry values whose origin we
  // genuinely do not know. Claiming "from your profile" for those was the
  // product asserting its most trusted label on its least verified data.
  unrecorded: { label: "source not recorded", cls: "text-attention" },
};

export function Provenance({ source }: { source: Source }) {
  const { label, cls } = SOURCE_COPY[source];
  return (
    <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${cls}`}>{label}</span>
  );
}

/**
 * The honest blank. When the machine had no profile-backed answer it says so
 * here, in the vocabulary of the form it's filling. This is the one place the
 * system allows itself a flourish, and the reason it earns it is that
 * admitting the gap *is* the product.
 */
export function NeedsYouStamp({ children = "needs you" }: { children?: React.ReactNode }) {
  return <span className="stamp text-attention">{children}</span>;
}

/**
 * A single ruled row from a register: label on the left, value on the right.
 * The atomic unit of every detail view in the app.
 *
 * `attention` tints the whole row amber — used when the row is a gap the user
 * has to close, so the thing needing work is visible from across the page.
 */
export function FieldRow({
  label,
  children,
  source,
  attention = false,
}: {
  label: string;
  children: React.ReactNode;
  source?: Source;
  attention?: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "mt-2 grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl bg-attention-soft px-3.5 py-3.5 sm:grid-cols-[minmax(9rem,14rem)_1fr]"
          : "field-rule grid grid-cols-1 gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(9rem,14rem)_1fr]"
      }
    >
      <div className="flex flex-col gap-1">
        <span className={attention ? "text-sm font-semibold text-attention" : "text-sm text-ink-soft"}>
          {label}
        </span>
        {source && <Provenance source={source} />}
      </div>
      <div className={`min-w-0 text-[15px] ${attention ? "text-attention" : "text-ink"}`}>{children}</div>
    </div>
  );
}
