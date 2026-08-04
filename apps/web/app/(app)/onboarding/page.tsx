"use client";

import { useEffect, useState } from "react";
import type { Profile, ParsedResume } from "@apply4you/shared";
import { ProfileForm } from "@/components/profile-form";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { Spinner } from "@/components/ui";

const PARSE_STAGES = [
  "reading your resume…",
  "extracting your work history…",
  "pulling out your skills…",
  "almost done…",
];

const EMPTY_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  links: {},
  workAuthorization: "",
  workHistory: [],
  projects: [],
  education: [],
  skills: [],
  summary: "",
  additionalInfo: "",
};

function mergeParsed(parsed: ParsedResume): Profile {
  return {
    ...EMPTY_PROFILE,
    ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)),
    links: parsed.links ?? {},
    workHistory: parsed.workHistory ?? [],
    projects: parsed.projects ?? [],
    education: parsed.education ?? [],
    skills: parsed.skills ?? [],
  };
}

export default function OnboardingPage() {
  const [phase, setPhase] = useState<"upload" | "parsing" | "review">("upload");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  // True when the user is typing their details in rather than having them parsed.
  const [manual, setManual] = useState(false);

  // Staged copy keeps the 10-20s parse from feeling frozen.
  useEffect(() => {
    if (phase !== "parsing") {
      setStage(0);
      return;
    }
    const t = setInterval(() => setStage((s) => Math.min(s + 1, PARSE_STAGES.length - 1)), 5000);
    return () => clearInterval(t);
  }, [phase]);

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

  /**
   * Escape hatch (IMPROVEMENTS D1). A parse failure used to drop the user back
   * on the same upload box with an error string and no way forward — one bad
   * PDF dead-ended the entire funnel at step 1. They can now type it in.
   */
  function startManual() {
    setProfile({ ...EMPTY_PROFILE });
    setManual(true);
    setError(null);
    setPhase("review");
  }

  if (phase === "review" && profile) {
    return (
      <div className="mx-auto max-w-3xl">
        <OnboardingSteps current={2} />
        <h1 className="text-xl font-semibold text-ink">Review your profile</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">
          {manual
            ? "Fill in what you can — name, contact details and your most recent role are enough to start. Every application is filled from this profile, and we never invent answers that aren't in it."
            : "We extracted this from your resume. Fix anything that's off — every application is filled from this profile, and we never invent answers that aren't in it."}
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
          <p className="flex items-center justify-center gap-2 font-mono text-sm text-accent">
            <Spinner />
            {PARSE_STAGES[stage]}
          </p>
          <p className="mt-2 text-xs text-ink-soft">usually 10–20 seconds</p>
        </div>
      ) : (
        <label className="w-full cursor-pointer rounded-lg border border-dashed border-line bg-card px-6 py-12 text-center text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink focus-within:border-accent focus-within:text-ink">
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          Click to choose a file
        </label>
      )}

      {error && (
        <div className="rounded-[3px] border border-danger/30 bg-danger-soft px-4 py-3 text-center">
          <p className="text-sm text-danger">{error}</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Some PDFs don&apos;t read cleanly. Try a different file, or{" "}
            <button type="button" onClick={startManual} className="font-medium text-ink underline decoration-line underline-offset-2">
              enter your details by hand
            </button>
            .
          </p>
        </div>
      )}

      {phase !== "parsing" && !error && (
        <p className="text-center text-xs text-ink-soft">
          No CV handy?{" "}
          <button type="button" onClick={startManual} className="underline decoration-line underline-offset-2 hover:text-ink">
            Enter your details by hand
          </button>
        </p>
      )}
    </div>
  );
}
