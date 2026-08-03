import { NextResponse } from "next/server";
import { TailoredCvSchema, renderCvHtml, resolveTailoredCv } from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
import { rowToProfile, type ProfileRow } from "@/lib/profile";

/**
 * Serves the exact CV that would be sent for one application (task #40/#45).
 *
 * Uses the RLS-scoped client on purpose — never the admin client. The row is
 * only readable if the signed-in user owns it, so authorisation is enforced by
 * the database rather than by a check we could forget here.
 *
 * This is the same markup the worker rasterises to PDF (renderCvHtml lives in
 * shared for exactly that reason), so what the user reviews is the artifact,
 * not a preview that can drift from it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: app }, { data: profileRow }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, tailored_cv")
      .eq("id", id)
      .maybeSingle<{ id: string; tailored_cv: unknown }>(),
    supabase.from("profiles").select("*").maybeSingle<ProfileRow>(),
  ]);

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!profileRow) return NextResponse.json({ error: "No profile yet" }, { status: 404 });
  if (!app.tailored_cv) {
    return NextResponse.json({ error: "No tailored CV for this application yet" }, { status: 404 });
  }

  const parsed = TailoredCvSchema.safeParse(app.tailored_cv);
  if (!parsed.success) {
    return NextResponse.json({ error: "Stored CV selection is unreadable" }, { status: 422 });
  }

  const profile = rowToProfile(profileRow);
  const html = renderCvHtml(profile, resolveTailoredCv(profile, parsed.data));

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A CV is personal data derived from a live profile; never let a shared
      // cache hold it, and never serve a stale one after a profile edit.
      "cache-control": "private, no-store",
    },
  });
}
