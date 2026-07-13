import { supabaseAdmin } from "../supabase.js";

/**
 * Operator view of AI spend. Prints total estimated cost, a per-operation
 * breakdown, and cost-per-submitted-application (the PRD metric).
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/ai-cost-report.ts
 */
async function main(): Promise<void> {
  const db = supabaseAdmin();

  const { data: rows, error } = await db
    .from("ai_usage")
    .select("operation, model, input_tokens, output_tokens, estimated_cost_usd");
  if (error) throw new Error(error.message);

  const byOp = new Map<string, { calls: number; input: number; output: number; cost: number }>();
  let totalCost = 0;
  for (const r of rows ?? []) {
    const agg = byOp.get(r.operation) ?? { calls: 0, input: 0, output: 0, cost: 0 };
    agg.calls++;
    agg.input += r.input_tokens ?? 0;
    agg.output += r.output_tokens ?? 0;
    agg.cost += Number(r.estimated_cost_usd ?? 0);
    byOp.set(r.operation, agg);
    totalCost += Number(r.estimated_cost_usd ?? 0);
  }

  console.log(`\nAI usage — ${rows?.length ?? 0} calls, $${totalCost.toFixed(4)} total\n`);
  console.log("operation".padEnd(22), "calls".padStart(7), "in-tok".padStart(10), "out-tok".padStart(10), "cost".padStart(10));
  for (const [op, a] of [...byOp.entries()].sort((x, y) => y[1].cost - x[1].cost)) {
    console.log(op.padEnd(22), String(a.calls).padStart(7), String(a.input).padStart(10), String(a.output).padStart(10), `$${a.cost.toFixed(4)}`.padStart(10));
  }

  const { count } = await db
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");
  const submitted = count ?? 0;
  if (submitted > 0) {
    console.log(`\ncost per submitted application: $${(totalCost / submitted).toFixed(4)} (${submitted} submitted)`);
  } else {
    console.log("\ncost per application: n/a (no submitted applications yet)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
