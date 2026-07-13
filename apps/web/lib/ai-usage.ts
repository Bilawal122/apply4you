import { setUsageSink, type UsageEvent } from "@apply4you/ai";
import { createAdminClient } from "@/lib/supabase/admin";

let registered = false;

/**
 * Route AI usage from web-side calls (resume parsing, summary derivation) into
 * the ai_usage table. Idempotent — safe to call per request; the sink is
 * module-global and set once per runtime instance.
 */
export function ensureUsageSink(): void {
  if (registered) return;
  registered = true;
  setUsageSink((e: UsageEvent) => {
    void createAdminClient()
      .from("ai_usage")
      .insert({
        operation: e.operation,
        model: e.model,
        input_tokens: e.inputTokens,
        output_tokens: e.outputTokens,
        cached_tokens: e.cachedTokens,
        estimated_cost_usd: e.estimatedCostUsd,
      })
      .then(({ error }) => {
        if (error) console.warn(`[ai_usage] insert failed: ${error.message}`);
      });
  });
}
