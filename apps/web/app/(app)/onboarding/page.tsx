"use client";

import { useState } from "react";
import type { Profile, ParsedResume } from "@apply4you/shared";
import { ProfileForm } from "@/components/profile-form";

const EMPTY_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  links: {},
  workAuthorization: "",
  workHistory: [],
  education: [],
  skills: [],
  summary: "",
};

function mergeParsed(parsed: ParsedResume): Profile {
  return {
    ...EMPTY_PROFILE,
    ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)),
    links: parsed.links ?? {},
    workHistory: parsed.workHistory ?? [],
    education: parsed.education ?? [],
    skills: parsed.skills ?? [],
  };
}

export default function OnboardingPage() {
  const [phase, setPhase] = useState<"upload" | "parsing" | "review">("upload");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setPhase("parsing");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const res = await fetch("/api/profile/parse", { method: "POST", body: formData });
      const body = (await res.json()) as { parsed?: ParsedResume; error?: string };
      if (!res.ok || !body.parsed) throw new Error(body.error ?? "Parse failed");
      setProfile(mergeParsed(body.parsed));
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("upload");
    }
  }

  if (phase === "review" && profile) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold">Review your profile</h1>
        <p className="mb-6 mt-1 text-sm text-neutral-500">
          We extracted this from your resume. Fix anything that&apos;s off — every application is filled from this
          profile, and we never invent answers that aren&apos;t in it.
        </p>
        <ProfileForm initial={profile} submitLabel="Save and continue" redirectTo="preferences" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-16 text-center">
      <div>
        <h1 className="text-xl font-semibold">Upload your resume</h1>
        <p className="mt-1 text-sm text-neutral-500">PDF or DOCX. We&apos;ll turn it into your profile.</p>
      </div>

      {phase === "parsing" ? (
        <div className="w-full rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-12 text-sm text-neutral-500">
          Reading your resume…
        </div>
      ) : (
        <label className="w-full cursor-pointer rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-12 text-sm text-neutral-600 hover:border-neutral-400">
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          Click to choose a file
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
