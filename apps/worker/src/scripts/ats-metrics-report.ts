import { supabaseAdmin } from "../supabase.js";

/**
 * Operator view of per-ATS submission health (PRD: track per-ATS success rate
 * from day one — bot-detection risk differs per ATS). Prints application
 * outcomes and failure reasons grouped by ATS.
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/ats-metrics-report.ts
 */
async function main(): Promise<void> {
  const db = supabaseAdmin();

  const { data: rows, error } = await db
    .from("applications")
    .select("status, failure_reason, jobs!inner(ats_type)");
  if (error) throw new Error(error.message);

  interface Agg {
    total: number;
    submitted: number;
    failed: number;
    inFlight: number;
    other: number;
    reasons: Map<string, number>;
  }
  const byAts = new Map<string, Agg>();

  for (const r of rows ?? []) {
    const ats = (r.jobs as unknown as { ats_type: string }).ats_type;
    const agg = byAts.get(ats) ?? { total: 0, submitted: 0, failed: 0, inFlight: 0, other: 0, reasons: new Map() };
    agg.total++;
    if (r.status === "submitted") agg.submitted++;
    else if (r.status === "failed") {
      agg.failed++;
      const reason = (r.failure_reason ?? "unknown").split(":")[0].trim();
      agg.reasons.set(reason, (agg.reasons.get(reason) ?? 0) + 1);
    } else if (["approved", "submitting"].includes(r.status)) agg.inFlight++;
    else agg.other++; // draft / needs_review / skipped
    byAts.set(ats, agg);
  }

  console.log(`\nPer-ATS submission health — ${rows?.length ?? 0} applications total\n`);
  console.log(
    "ats".padEnd(12),
    "total".padStart(6),
    "submitted".padStart(10),
    "failed".padStart(7),
    "in-flight".padStart(10),
    "pending/other".padStart(14),
    "success".padStart(9),
  );
  for (const [ats, a] of [...byAts.entries()].sort()) {
    const attempts = a.submitted + a.failed;
    const rate = attempts > 0 ? `${Math.round((a.submitted / attempts) * 100)}%` : "n/a";
    console.log(
      ats.padEnd(12),
      String(a.total).padStart(6),
      String(a.submitted).padStart(10),
      String(a.failed).padStart(7),
      String(a.inFlight).padStart(10),
      String(a.other).padStart(14),
      rate.padStart(9),
    );
  }

  let anyReasons = false;
  for (const [ats, a] of byAts) {
    if (a.reasons.size === 0) continue;
    if (!anyReasons) {
      console.log("\nfailure reasons:");
      anyReasons = true;
    }
    for (const [reason, n] of [...a.reasons.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`  ${ats}: ${reason} × ${n}`);
    }
  }
  if (!anyReasons) console.log("\nno failures recorded yet");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
