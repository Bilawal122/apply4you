import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Signed links expire in an hour — long enough to download, short enough to leak safely. */
const SIGNED_URL_TTL_SECONDS = 3600;

/** Full data export (GDPR-style): every row the user owns + links to their files. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, preferences, applications, events, matches, subscription] = await Promise.all([
    supabase.from("profiles").select("*").single(),
    supabase.from("preferences").select("*").single(),
    supabase.from("applications").select("*"),
    supabase.from("application_events").select("*"),
    supabase.from("job_matches").select("*"),
    supabase.from("subscriptions").select("*").single(),
  ]);

  let resumeUrl: string | null = null;
  const path = (profile.data as { resume_storage_path?: string } | null)?.resume_storage_path;
  if (path) {
    const { data: signed } = await supabase.storage
      .from("resumes")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    resumeUrl = signed?.signedUrl ?? null;
  }

  /*
   * Application artifacts: the tailored CV actually sent to the employer, the
   * confirmation capture, and any failure screenshot. These were missing from
   * the export while account deletion removes them — so the two halves of the
   * data-rights promise disagreed, and the file with the most personal data in
   * it (the CV an employer received) was the one the user could not get back.
   *
   * The `artifacts` bucket is service-role only, so signing needs the admin
   * client. Ownership is not taken on trust: the ids come from the
   * RLS-scoped query above, which can only ever return this user's rows.
   */
  const applicationIds = ((applications.data ?? []) as { id: string }[]).map((a) => a.id);
  const artifactFiles: { applicationId: string; kind: string; downloadUrl: string }[] = [];
  if (applicationIds.length > 0) {
    const admin = createAdminClient();
    const wanted = applicationIds.flatMap((id) => [
      { applicationId: id, kind: "tailored_cv", path: `cvs/${id}.pdf` },
      { applicationId: id, kind: "confirmation_screenshot", path: `confirmations/${id}.png` },
      { applicationId: id, kind: "failure_screenshot", path: `failures/${id}.png` },
    ]);
    // Most applications never produced all three, so a per-path failure is
    // expected and simply means "no such artifact" — never an export error.
    const { data: signed } = await admin.storage
      .from("artifacts")
      .createSignedUrls(
        wanted.map((w) => w.path),
        SIGNED_URL_TTL_SECONDS,
      );
    for (const [i, result] of (signed ?? []).entries()) {
      const meta = wanted[i];
      if (!meta || result.error || !result.signedUrl) continue;
      artifactFiles.push({
        applicationId: meta.applicationId,
        kind: meta.kind,
        downloadUrl: result.signedUrl,
      });
    }
  }

  return new NextResponse(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: profile.data,
        preferences: preferences.data,
        subscription: subscription.data,
        applications: applications.data,
        applicationEvents: events.data,
        jobMatches: matches.data,
        resumeDownloadUrl: resumeUrl,
        applicationFiles: artifactFiles,
        note: "Download links expire one hour after this export was generated.",
      },
      null,
      2,
    ),
    {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="apply4you-export-${user.id.slice(0, 8)}.json"`,
      },
    },
  );
}
