import { createClient } from "@/lib/supabase/server";
import { cardCls } from "@/components/ui";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft/70">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const startOfToday = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();

  const [
    { count: totalSubmitted },
    { count: submittedToday },
    { count: pendingReview },
    { count: matched },
    { count: failed },
    { data: sub },
  ] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .gte("submitted_at", startOfToday),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "needs_review"]),
    supabase.from("job_matches").select("job_id", { count: "exact", head: true }),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("subscriptions").select("plan, applications_used, applications_limit, period_end").single(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Submitted total" value={totalSubmitted ?? 0} />
        <Stat label="Submitted today" value={submittedToday ?? 0} />
        <Stat label="Waiting for review" value={pendingReview ?? 0} />
        <Stat label="Jobs matched" value={matched ?? 0} />
        <Stat label="Failed (apply manually)" value={failed ?? 0} />
        {sub && (
          <Stat
            label={`Plan: ${sub.plan}`}
            value={`${sub.applications_used} / ${sub.applications_limit}`}
            hint={`resets ${new Date(sub.period_end).toLocaleDateString()}`}
          />
        )}
      </div>
    </div>
  );
}
