"use client";

import { useState } from "react";
import type { Profile, ParsedResume } from "@apply4you/shared";
import { ProfileForm } from "@/components/profile-form";
import { OnboardingSteps } from "@/components/onboarding-steps";

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
        <OnboardingSteps current={2} />
        <h1 className="text-xl font-semibold text-ink">Review your profile</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">
          We extracted this from your resume. Fix anything that&apos;s off — every application is filled from this
          profile, and we never invent answers that aren&apos;t in it.
        </p>
        <ProfileForm initial={profile} submitLabel="Save and continue" redirectTo="preferences" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-10">
      <OnboardingSteps current={1} />
      <div className="text-center">
        <h1 className="text-xl font-semibold text-ink">Upload your resume</h1>
        <p className="mt-1 text-sm text-ink-soft">PDF or DOCX. We&apos;ll turn it into your profile.</p>
      </div>

      {phase === "parsing" ? (
        <div className="w-full rounded-lg border border-dashed border-accent/40 bg-accent-soft px-6 py-12 text-center">
          <p className="font-mono text-sm text-accent">reading your resume…</p>
          <p className="mt-1 text-xs text-ink-soft">usually 10–20 seconds</p>
        </div>
      ) : (
        <label className="w-full cursor-pointer rounded-lg border border-dashed border-line bg-card px-6 py-12 text-center text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink">
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

      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
