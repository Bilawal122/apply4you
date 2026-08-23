import { setUsageSink, type UsageEvent } from "@apply4you/ai";
import { supabaseAdmin } from "./supabase.js";

/** Route AI usage events into the ai_usage table (fire-and-forget). */
export function registerUsageSink(): void {
  setUsageSink((e: UsageEvent) => {
    void supabaseAdmin()
      .from("ai_usage")
      .insert({
        operation: e.operation,
        model: e.model,
        input_tokens: e.inputTokens,
        output_tokens: e.outputTokens,
        cached_tokens: e.cachedTokens,
        estimated_cost_usd: e.estimatedCostUsd,
        user_id: e.userId ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn(`[ai_usage] insert failed: ${error.message}`);
      });
  });
}
