"use client";

import { useActionState, useState } from "react";
import type { Profile, WorkHistoryEntry, EducationEntry, ProjectEntry } from "@apply4you/shared";
import { saveProfile, type SaveState } from "@/app/(app)/actions";
import { Spinner, btnPrimary, btnSecondarySm, inputCls, insetCls, labelCls } from "@/components/ui";

const emptyJob: WorkHistoryEntry = { company: "", title: "", start: "", end: "present", bullets: [] };
const emptyEdu: EducationEntry = { school: "", degree: "", field: "", start: "", end: "" };
const emptyProject: ProjectEntry = { name: "", tech: "", url: "", bullets: [] };

/**
 * Sections are separated by the same hairline a ruled register uses, so the
 * form reads as one continuous list of facts rather than a stack of boxes.
 * The first section gets no rule — it opens the card.
 */
const ruledSection = "border-t border-line-soft pt-7";

/** A repeated entry (a role, a project, a degree) is an inset inside the card. */
const entryCls = `${insetCls} p-4`;

/** Removing an unsaved entry is reversible-but-destructive: brick, not a pill. */
const removeCls =
  "text-[12px] font-semibold text-danger underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger";

export function ProfileForm({
  initial,
  submitLabel = "Save profile",
  redirectTo,
}: {
  initial: Profile;
  submitLabel?: string;
  redirectTo?: string;
}) {
  const [profile, setProfile] = useState<Profile>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProfile, null);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  const setJob = (i: number, patch: Partial<WorkHistoryEntry>) =>
    set(
      "workHistory",
      profile.workHistory.map((j, idx) => (idx === i ? { ...j, ...patch } : j)),
    );

  const setProject = (i: number, patch: Partial<ProjectEntry>) =>
    set(
      "projects",
      profile.projects.map((pr, idx) => (idx === i ? { ...pr, ...patch } : pr)),
    );

  const setEdu = (i: number, patch: Partial<EducationEntry>) =>
    set(
      "education",
      profile.education.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    );

  return (
    <form action={action} className="flex flex-col gap-7">
      <input type="hidden" name="profile" value={JSON.stringify(profile)} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>First name</label>
          <input className={inputCls} value={profile.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Last name</label>
          <input className={inputCls} value={profile.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} type="email" value={profile.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input className={inputCls} value={profile.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <input
            className={inputCls}
            placeholder="City, State"
            value={profile.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Work authorization</label>
          <input
            className={inputCls}
            placeholder='e.g. "US citizen", "H-1B, needs sponsorship"'
            value={profile.workAuthorization}
            onChange={(e) => set("workAuthorization", e.target.value)}
          />
        </div>
      </section>

      <section className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${ruledSection}`}>
        <div>
          <label className={labelCls}>LinkedIn URL</label>
          <input
            className={inputCls}
            value={profile.links.linkedin ?? ""}
            onChange={(e) => set("links", { ...profile.links, linkedin: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>GitHub URL</label>
          <input
            className={inputCls}
            value={profile.links.github ?? ""}
            onChange={(e) => set("links", { ...profile.links, github: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Portfolio URL</label>
          <input
            className={inputCls}
            value={profile.links.portfolio ?? ""}
            onChange={(e) => set("links", { ...profile.links, portfolio: e.target.value })}
          />
        </div>
      </section>

      <section className={ruledSection}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label-mono">Work history</h2>
          <button
            type="button"
            className={btnSecondarySm}
            onClick={() => set("workHistory", [...profile.workHistory, { ...emptyJob }])}
          >
            Add role
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {profile.workHistory.map((job, i) => (
            <div key={i} className={entryCls}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input className={inputCls} placeholder="Company" value={job.company} onChange={(e) => setJob(i, { company: e.target.value })} />
                <input className={inputCls} placeholder="Title" value={job.title} onChange={(e) => setJob(i, { title: e.target.value })} />
                <input className={inputCls} placeholder="Start (YYYY-MM)" value={job.start} onChange={(e) => setJob(i, { start: e.target.value })} />
                <input className={inputCls} placeholder='End (YYYY-MM or "present")' value={job.end} onChange={(e) => setJob(i, { end: e.target.value })} />
              </div>
              <textarea
                className={`${inputCls} mt-3`}
                rows={3}
                placeholder="Achievements, one per line"
                value={job.bullets.join("\n")}
                onChange={(e) => setJob(i, { bullets: e.target.value.split("\n").filter(Boolean) })}
              />
              <button
                type="button"
                className={`${removeCls} mt-3`}
                onClick={() => set("workHistory", profile.workHistory.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={ruledSection}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="label-mono">Projects</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-soft">
              Side projects, open source, portfolio work. Often the strongest evidence you have.
            </p>
          </div>
          <button
            type="button"
            className={btnSecondarySm}
            onClick={() => set("projects", [...profile.projects, { ...emptyProject }])}
          >
            Add project
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {profile.projects.map((pr, i) => (
            <div key={i} className={entryCls}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input className={inputCls} placeholder="Project name" value={pr.name} onChange={(e) => setProject(i, { name: e.target.value })} />
                <input className={inputCls} placeholder="Tech / stack" value={pr.tech} onChange={(e) => setProject(i, { tech: e.target.value })} />
              </div>
              <input className={`${inputCls} mt-3`} placeholder="URL (optional)" value={pr.url} onChange={(e) => setProject(i, { url: e.target.value })} />
              <textarea
                className={`${inputCls} mt-3`}
                rows={3}
                placeholder="What it does and what you built, one per line"
                value={pr.bullets.join("\n")}
                onChange={(e) => setProject(i, { bullets: e.target.value.split("\n").filter(Boolean) })}
              />
              <button
                type="button"
                className={`${removeCls} mt-3`}
                onClick={() => set("projects", profile.projects.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={ruledSection}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="label-mono">Education</h2>
          <button
            type="button"
            className={btnSecondarySm}
            onClick={() => set("education", [...profile.education, { ...emptyEdu }])}
          >
            Add education
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {profile.education.map((edu, i) => (
            <div key={i} className={`${entryCls} grid grid-cols-1 gap-3 sm:grid-cols-2`}>
              <input className={inputCls} placeholder="School" value={edu.school} onChange={(e) => setEdu(i, { school: e.target.value })} />
              <input className={inputCls} placeholder="Degree" value={edu.degree} onChange={(e) => setEdu(i, { degree: e.target.value })} />
              <input className={inputCls} placeholder="Field of study" value={edu.field} onChange={(e) => setEdu(i, { field: e.target.value })} />
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Start" value={edu.start} onChange={(e) => setEdu(i, { start: e.target.value })} />
                <input className={inputCls} placeholder="End" value={edu.end} onChange={(e) => setEdu(i, { end: e.target.value })} />
              </div>
              <button
                type="button"
                className={`${removeCls} text-left`}
                onClick={() => set("education", profile.education.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={ruledSection}>
        <label className={labelCls}>Skills (comma-separated)</label>
        <textarea
          className={inputCls}
          rows={2}
          value={profile.skills.join(", ")}
          onChange={(e) => set("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </section>

      <section className={ruledSection}>
        <label className={labelCls}>
          Professional summary (leave blank to auto-generate from your profile)
        </label>
        <textarea className={inputCls} rows={4} value={profile.summary} onChange={(e) => set("summary", e.target.value)} />
      </section>

      <section className={ruledSection}>
        <label className={labelCls}>Additional info (optional)</label>
        <p className="mb-2.5 text-[13px] leading-[1.5] text-ink-soft">
          Anything a CV can&apos;t capture: career goals, constraints, things you&apos;d want mentioned
          in a cover letter, context for gaps. The AI reads this for every application — grounded only
          in what you write here, never invented.
        </p>
        <textarea
          className={inputCls}
          rows={4}
          placeholder="e.g. Looking to move from backend to full-stack. Available to start immediately. Prefer product-focused teams over pure infra."
          value={profile.additionalInfo}
          onChange={(e) => set("additionalInfo", e.target.value)}
        />
      </section>

      {state && "error" in state && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">Saved.</p>
      )}

      <button type="submit" disabled={pending} className={`${btnPrimary} self-start`}>
        {pending && <Spinner />}
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
