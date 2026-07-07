import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Full data export (GDPR-style): every row the user owns + a resume link. */
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
    const { data: signed } = await supabase.storage.from("resumes").createSignedUrl(path, 3600);
    resumeUrl = signed?.signedUrl ?? null;
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
