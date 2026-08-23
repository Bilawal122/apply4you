"use client";

import { useActionState, useState } from "react";
import type { Profile, WorkHistoryEntry, EducationEntry, ProjectEntry } from "@apply4you/shared";
import { saveProfile, type SaveState } from "@/app/(app)/actions";
import { Spinner, btnPrimary, btnSecondarySm, inputCls, insetCls, labelCls } from "@/components/ui";
import { SelectWithOther, SuggestInput } from "@/components/form-fields";
import {
  DEGREE_OPTIONS,
  FIELD_OF_STUDY_OPTIONS,
  INSTITUTION_SUGGESTIONS,
  JOB_TITLE_SUGGESTIONS,
  SKILL_SUGGESTIONS,
  WORK_AUTHORIZATION_OPTIONS,
} from "@apply4you/shared";

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
  const [skillDraft, setSkillDraft] = useState("");
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

  const addSkill = (raw: string) => {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    setSkillDraft("");
    // Case-insensitive dedupe: "excel" and "Excel" are one skill to an employer.
    if (profile.skills.some((s) => s.toLowerCase() === value.toLowerCase())) return;
    set("skills", [...profile.skills, value]);
  };

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
            placeholder="Town or city"
            value={profile.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <SelectWithOther
            id="work-auth"
            label="Right to work"
            help="Employers ask this on almost every application, and it is always required. We never answer it for you — so until it is set here, every form that asks comes back to you before it can be sent."
            options={WORK_AUTHORIZATION_OPTIONS}
            value={profile.workAuthorization}
            onChange={(v) => set("workAuthorization", v)}
            placeholder="Describe your right to work in your own words"
          />
        </div>
      </section>

      <section className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${ruledSection}`}>
        <div>
          <label className={labelCls}>LinkedIn URL (optional)</label>
          <input
            className={inputCls}
            value={profile.links.linkedin ?? ""}
            onChange={(e) => set("links", { ...profile.links, linkedin: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>GitHub URL (optional)</label>
          <input
            className={inputCls}
            value={profile.links.github ?? ""}
            onChange={(e) => set("links", { ...profile.links, github: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Portfolio or website (optional)</label>
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
                <SuggestInput
                  id={`job-title-${i}`}
                  options={JOB_TITLE_SUGGESTIONS}
                  placeholder="Job title"
                  value={job.title}
                  onChange={(e) => setJob(i, { title: e.target.value })}
                />
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
            <h2 className="label-mono">Projects & experience</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-soft">
              Anything that shows what you can do and isn&apos;t a job: a dissertation, a
              society you ran, volunteering, a mooting competition, a portfolio, a side
              project. Often the strongest evidence a graduate has.
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
                <input
                  className={inputCls}
                  placeholder="Context (tools, subject, organisation)"
                  value={pr.tech}
                  onChange={(e) => setProject(i, { tech: e.target.value })}
                />
              </div>
              <input className={`${inputCls} mt-3`} placeholder="URL (optional)" value={pr.url} onChange={(e) => setProject(i, { url: e.target.value })} />
              <textarea
                className={`${inputCls} mt-3`}
                rows={3}
                placeholder="What it was and what you did, one per line"
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
              <SuggestInput
                id={`edu-school-${i}`}
                options={INSTITUTION_SUGGESTIONS}
                placeholder="School, college or university"
                value={edu.school}
                onChange={(e) => setEdu(i, { school: e.target.value })}
              />
              <SuggestInput
                id={`edu-degree-${i}`}
                options={DEGREE_OPTIONS}
                placeholder="Qualification (GCSEs, BTEC, LLB…)"
                value={edu.degree}
                onChange={(e) => setEdu(i, { degree: e.target.value })}
              />
              <SuggestInput
                id={`edu-field-${i}`}
                options={FIELD_OF_STUDY_OPTIONS}
                placeholder="Subject"
                value={edu.field}
                onChange={(e) => setEdu(i, { field: e.target.value })}
              />
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
        <label className={labelCls} htmlFor="skill-add">
          Skills
        </label>
        <p className="mb-2.5 text-[13px] leading-[1.5] text-ink-soft">
          Start typing and we&apos;ll suggest — customer service and de-escalation count
          exactly as much as SQL. Press Enter to add, or type your own.
        </p>
        {profile.skills.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {profile.skills.map((skill, i) => (
              <span
                key={`${skill}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper-tint px-3 py-1.5 text-[13.5px] text-ink"
              >
                {skill}
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  className="text-ink-faint transition-colors hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                  onClick={() => set("skills", profile.skills.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <SuggestInput
          id="skill-add"
          options={SKILL_SUGGESTIONS.filter((o) => !profile.skills.includes(o))}
          placeholder="Add a skill…"
          value={skillDraft}
          onChange={(e) => setSkillDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== ",") return;
            e.preventDefault(); // never submit the whole form from this field
            addSkill(skillDraft);
          }}
          onBlur={() => addSkill(skillDraft)}
        />
      </section>

      <section className={ruledSection}>
        <label className={labelCls}>Professional summary</label>
        <p className="mb-2.5 text-[13px] leading-[1.5] text-ink-soft">
          Leave it blank and we&apos;ll write one from your profile shortly after you save —
          it appears here once it&apos;s ready. Anything you write yourself is kept as-is.
        </p>
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
          placeholder="e.g. Graduating in June and available from July. Looking for a first role in employment law. Happy to relocate anywhere in the North West."
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
