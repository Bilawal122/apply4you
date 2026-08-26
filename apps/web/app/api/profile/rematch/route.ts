import { NextResponse } from "next/server";
import { withUsageUser } from "@apply4you/ai";
import { createClient } from "@/lib/supabase/server";
import { ensureUsageSink } from "@/lib/ai-usage";
import { runMatchNow } from "@/lib/matching";

/**
 * Build this user's match set now, without the worker.
 *
 * A route handler rather than a Server Action because only a route segment can
 * raise its own function limit — an action inherits the platform default (10s
 * on Hobby), and while `match_jobs` returns in ~40ms warm it takes several
 * seconds against a cold vector index, which is exactly the case a brand-new
 * account hits.
 */
export const maxDuration = 60;

export async function POST() {
  ensureUsageSink();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Attributed to the user whose profile is being embedded (D6 cost tracking).
    const result = await withUsageUser(user.id, () => runMatchNow(user.id));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[rematch] ${user.id}: ${message}`);
    // The message is ours, not a provider's — the client shows it verbatim, and
    // a silent failure here is what left the feed spinning in the first place.
    return NextResponse.json({ error: "Matching failed. Please try again." }, { status: 500 });
  }
}
