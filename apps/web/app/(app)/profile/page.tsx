import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rowToProfile, type ProfileRow } from "@/lib/profile";
import { ProfileForm } from "@/components/profile-form";
import { DangerZone } from "@/components/danger-zone";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: row } = await supabase.from("profiles").select("*").single<ProfileRow>();

  const profile = row ? rowToProfile(row) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Profile</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-500">
        The single source of truth for every application.{" "}
        {row?.resume_filename ? (
          <>
            Resume on file: <span className="font-medium">{row.resume_filename}</span> —{" "}
            <Link href="/onboarding" className="underline">
              replace
            </Link>
          </>
        ) : (
          <Link href="/onboarding" className="underline">
            Upload a resume
          </Link>
        )}
      </p>
      {profile ? (
        <ProfileForm initial={profile} />
      ) : (
        <p className="text-sm text-neutral-500">
          No profile yet.{" "}
          <Link href="/onboarding" className="underline">
            Start by uploading your resume.
          </Link>
        </p>
      )}
      <DangerZone />
    </div>
  );
}
