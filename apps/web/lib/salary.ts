/**
 * Formatting for employer-published pay.
 *
 * Everything here renders a figure the employer themselves published, or
 * nothing. There is no estimation, no "market rate", no parsing of salary out
 * of description prose. Greenhouse and Workable expose no compensation field at
 * all (verified 2026-08), so about half the index legitimately has none — those
 * jobs say "not stated" rather than showing a guess.
 */

export interface JobSalary {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_summary: string | null;
}

const SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", CAD: "CA$", AUD: "A$", INR: "₹" };

const PERIOD_SUFFIX: Record<string, string> = {
  year: "/yr",
  month: "/mo",
  week: "/wk",
  day: "/day",
  hour: "/hr",
};

/** 211400 -> "211.4K"; 95000 -> "95K"; 45 -> "45" (hourly rates stay whole). */
function compact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}K`;
  }
  return String(Math.round(n));
}

/**
 * Returns a display string, or null when the employer published nothing.
 * Callers render "Salary not stated" for null — never a placeholder number.
 */
export function formatSalary(job: JobSalary): string | null {
  const { salary_min: min, salary_max: max, salary_currency: currency, salary_period: period } = job;

  if (min == null && max == null) {
    // Some employers publish only prose ("$211.4K – $290.6K • Offers Equity").
    // Their wording beats nothing, so it's shown verbatim.
    return job.salary_summary?.trim() || null;
  }

  const symbol = currency ? (SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `) : "";
  const suffix = period ? (PERIOD_SUFFIX[period.toLowerCase()] ?? "") : "";

  const range =
    min != null && max != null && min !== max
      ? `${symbol}${compact(min)} – ${symbol}${compact(max)}`
      : `${symbol}${compact((min ?? max)!)}`;

  return `${range}${suffix}`;
}

/** Extra context the employer gave beyond the numbers (equity, bonus, benefits). */
export function salaryExtras(job: JobSalary): string | null {
  if (!job.salary_summary) return null;
  const extras = job.salary_summary
    .split("•")
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);
  return extras.length ? extras.join(" · ") : null;
}
