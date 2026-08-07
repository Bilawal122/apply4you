"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Profile, ParsedResume } from "@apply4you/shared";
import { ProfileForm } from "@/components/profile-form";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { Spinner, btnSecondarySm, cardCls, Eyebrow } from "@/components/ui";

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

/**
 * The handful of things every application form asks for. A CV usually supplies
 * most of them; the ones it didn't are shown as amber gaps rather than filled
 * with a plausible guess, which is the entire argument of the product. Each
 * value below is read straight off the parse — nothing here is inferred.
 */
const CORE_FIELDS: { label: string; value: (p: Profile) => string }[] = [
  {
    label: "Name",
    value: (p) => [p.firstName, p.lastName].map((s) => s.trim()).filter(Boolean).join(" "),
  },
  { label: "Email", value: (p) => p.email.trim() },
  { label: "Phone", value: (p) => p.phone.trim() },
  { label: "Location", value: (p) => p.location.trim() },
  {
    label: "Most recent role",
    value: (p) => {
      const job = p.workHistory[0];
      if (!job) return "";
      return [job.title, job.company].map((s) => s.trim()).filter(Boolean).join(", ");
    },
  },
  { label: "Right to work", value: (p) => p.workAuthorization.trim() },
];

/**
 * "N fields extracted" counts exactly the profile fields the parse came back
 * with something in — a number we can point at line by line, not a headline.
 */
function countExtracted(p: Profile): number {
  const scalars = [
    p.firstName,
    p.lastName,
    p.email,
    p.phone,
    p.location,
    p.workAuthorization,
    p.links.linkedin ?? "",
    p.links.github ?? "",
    p.links.portfolio ?? "",
  ];
  const lists = [p.workHistory.length, p.projects.length, p.education.length, p.skills.length];
  return scalars.filter((v) => v.trim() !== "").length + lists.filter((n) => n > 0).length;
}

/** The CV as an object: a page with three ruled lines, the last one lime. */
function DocIcon({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="4" y="2" width="18" height="22" rx="3" fill="var(--color-line)" />
      <rect x="8" y="7" width="10" height="1.8" rx="0.9" fill="var(--color-ink-faint)" />
      <rect x="8" y="11" width="10" height="1.8" rx="0.9" fill="var(--color-ink-faint)" />
      <rect x="8" y="15" width="6" height="1.8" rx="0.9" fill="var(--color-lime)" />
    </svg>
  );
}

/**
 * The guardrails, stated as refusals. Every line restates a promise the app
 * already makes somewhere it can be checked — the profile copy below, the
 * review gate on step 4, and the privacy page — so nothing new is claimed here.
 */
const NEVERS = [
  "Invent an answer this profile can’t back",
  "Send an application before you approve it",
  "Submit on LinkedIn or Indeed, or store credentials for them",
];

function NeverCard() {
  return (
    <div className={`${cardCls} px-6 py-6`}>
      <Eyebrow>What we will never do</Eyebrow>
      <ul className="mt-4 flex flex-col gap-3 text-[14px] leading-[1.5] text-ink-body">
        {NEVERS.map((line) => (
          <li key={line} className="flex gap-2.5">
            <span aria-hidden="true" className="font-mono text-attention">
              ✕
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The frame every phase of this page shares: step rail, masthead, two columns. */
function Frame({
  step,
  title,
  sub,
  children,
}: {
  step: 1 | 2;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1080px]">
      <OnboardingSteps current={step} className="mb-10" />
      <h1 className="display text-[28px] text-ink sm:text-[34px]">{title}</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-[1.6] text-ink-body">{sub}</p>
      <div className="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{children}</div>
        <NeverCard />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [phase, setPhase] = useState<"upload" | "parsing" | "review">("upload");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  // True when the user is typing their details in rather than having them parsed.
  const [manual, setManual] = useState(false);
  // The file they actually handed us, so the review card can name it.
  const [fileName, setFileName] = useState<string | null>(null);

  // Staged copy keeps the 10-20s parse from feeling frozen. The stage is reset
  // by whoever starts a parse, not by this effect — resetting state inside an
  // effect body costs a cascading render for no gain, and `stage` is only ever
  // read while the parse is on screen.
  useEffect(() => {
    if (phase !== "parsing") return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, PARSE_STAGES.length - 1)), 5000);
    return () => clearInterval(t);
  }, [phase]);

  async function handleUpload(file: File) {
    setStage(0);
    setPhase("parsing");
    setError(null);
    setFileName(file.name);
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
      setFileName(null);
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
    setFileName(null);
    setPhase("review");
  }

  /** "Replace" hands them back the upload box rather than silently re-parsing
   *  underneath a form they may already have edited. */
  function replaceFile() {
    setProfile(null);
    setManual(false);
    setError(null);
    setFileName(null);
    setPhase("upload");
  }

  if (phase === "review" && profile) {
    const rows = CORE_FIELDS.map((f) => ({ label: f.label, value: f.value(profile) }));
    const gaps = rows.filter((r) => r.value === "").length;

    return (
      <Frame
        step={2}
        title={manual ? "Tell us what an application asks for." : "We read your CV. Here’s what we took from it."}
        sub={
          manual
            ? "Fill in what you can — name, contact details and your most recent role are enough to start. Every application is filled from this profile, and we never invent answers that aren't in it."
            : "We extracted this from your resume. Fix anything that's off — every application is filled from this profile, and we never invent answers that aren't in it."
        }
      >
        <div className={`${cardCls} px-4 py-6 sm:px-7`}>
          {!manual && fileName && (
            <div className="flex flex-wrap items-center gap-4 border-b border-line-soft pb-5">
              <DocIcon />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink" title={fileName}>
                  {fileName}
                </p>
                <p className="mt-0.5 font-mono text-[11.5px] text-ink-soft">
                  {countExtracted(profile)} fields extracted
                </p>
              </div>
              <button type="button" onClick={replaceFile} className={btnSecondarySm}>
                Replace
              </button>
            </div>
          )}

          {!manual && (
            <>
              <div className="mt-1">
                {rows.map((row) =>
                  row.value ? (
                    <div
                      key={row.label}
                      className="field-rule grid grid-cols-1 gap-x-5 gap-y-1 py-3.5 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)_auto] sm:items-center"
                    >
                      <p className="text-[14px] text-ink-soft">{row.label}</p>
                      <p className="min-w-0 break-words text-[15px] font-semibold text-ink">{row.value}</p>
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-ink-soft">
                        from your CV
                      </span>
                    </div>
                  ) : (
                    <div
                      key={row.label}
                      className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1 rounded-xl bg-attention-soft px-3.5 py-3.5 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)_auto] sm:items-center"
                    >
                      <p className="text-[14px] font-semibold text-attention">{row.label}</p>
                      <p className="text-[15px] font-semibold text-attention">
                        Not on your CV — add it below
                      </p>
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-attention">
                        we didn&rsquo;t guess
                      </span>
                    </div>
                  ),
                )}
              </div>
              <p className="mt-5 font-mono text-[12.5px] text-ink-soft">
                {gaps === 0
                  ? `all ${rows.length} fields we need were on your cv`
                  : `${gaps} field${gaps === 1 ? "" : "s"} your cv didn't cover`}
              </p>
              <hr className="mt-6 border-0 border-t border-line-soft" />
            </>
          )}

          <div className={manual ? "" : "mt-7"}>
            <ProfileForm initial={profile} submitLabel="Save and continue" redirectTo="preferences" />
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      step={1}
      title="Upload your resume"
      sub="PDF or DOCX. We’ll turn it into your profile."
    >
      <div className={`${cardCls} px-5 py-6 sm:px-7`}>
        {phase === "parsing" ? (
          <div className="rounded-xl bg-accent-soft px-6 py-14 text-center">
            <p className="flex items-center justify-center gap-2 font-mono text-[13px] text-accent">
              <Spinner />
              {PARSE_STAGES[stage]}
            </p>
            <p className="mt-2 font-mono text-[11.5px] text-ink-soft">
              {fileName ? `${fileName} · usually 10–20 seconds` : "usually 10–20 seconds"}
            </p>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-paper-tint px-6 py-14 text-center transition-colors hover:border-ink-faint focus-within:border-ink-faint focus-within:ring-2 focus-within:ring-lime/50">
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <DocIcon className="h-10 w-10" />
            <span className="text-[15px] font-semibold text-ink">Click to choose a file</span>
            <span className="font-mono text-[11.5px] text-ink-soft">pdf · docx</span>
          </label>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-danger-soft px-4 py-3.5">
            <p className="font-mono text-[13px] text-danger">{error}</p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-ink-body">
              Some PDFs don&apos;t read cleanly. Try a different file, or{" "}
              <button
                type="button"
                onClick={startManual}
                className="font-semibold text-ink underline underline-offset-2 hover:text-ink-soft"
              >
                enter your details by hand
              </button>
              .
            </p>
          </div>
        )}

        {phase !== "parsing" && !error && (
          <p className="mt-4 text-center text-[13px] text-ink-soft">
            No CV handy?{" "}
            <button
              type="button"
              onClick={startManual}
              className="font-semibold text-ink underline underline-offset-2 hover:text-ink-soft"
            >
              Enter your details by hand
            </button>
          </p>
        )}
      </div>
    </Frame>
  );
}
