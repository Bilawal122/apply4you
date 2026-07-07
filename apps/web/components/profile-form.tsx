"use client";

import { useActionState, useState } from "react";
import type { Profile, WorkHistoryEntry, EducationEntry } from "@apply4you/shared";
import { saveProfile, type SaveState } from "@/app/(app)/actions";

const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const labelCls = "text-xs font-medium text-neutral-600";

const emptyJob: WorkHistoryEntry = { company: "", title: "", start: "", end: "present", bullets: [] };
const emptyEdu: EducationEntry = { school: "", degree: "", field: "", start: "", end: "" };

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

  const setEdu = (i: number, patch: Partial<EducationEntry>) =>
    set(
      "education",
      profile.education.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    );

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="profile" value={JSON.stringify(profile)} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <section className="grid grid-cols-2 gap-4">
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

      <section className="grid grid-cols-3 gap-4">
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

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Work history</h2>
          <button
            type="button"
            className="text-sm text-neutral-600 underline"
            onClick={() => set("workHistory", [...profile.workHistory, { ...emptyJob }])}
          >
            + Add role
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {profile.workHistory.map((job, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="grid grid-cols-2 gap-3">
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
                className="mt-2 text-xs text-red-600 underline"
                onClick={() => set("workHistory", profile.workHistory.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Education</h2>
          <button
            type="button"
            className="text-sm text-neutral-600 underline"
            onClick={() => set("education", [...profile.education, { ...emptyEdu }])}
          >
            + Add education
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {profile.education.map((edu, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
              <input className={inputCls} placeholder="School" value={edu.school} onChange={(e) => setEdu(i, { school: e.target.value })} />
              <input className={inputCls} placeholder="Degree" value={edu.degree} onChange={(e) => setEdu(i, { degree: e.target.value })} />
              <input className={inputCls} placeholder="Field of study" value={edu.field} onChange={(e) => setEdu(i, { field: e.target.value })} />
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Start" value={edu.start} onChange={(e) => setEdu(i, { start: e.target.value })} />
                <input className={inputCls} placeholder="End" value={edu.end} onChange={(e) => setEdu(i, { end: e.target.value })} />
              </div>
              <button
                type="button"
                className="text-left text-xs text-red-600 underline"
                onClick={() => set("education", profile.education.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <label className={labelCls}>Skills (comma-separated)</label>
        <textarea
          className={inputCls}
          rows={2}
          value={profile.skills.join(", ")}
          onChange={(e) => set("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </section>

      <section>
        <label className={labelCls}>
          Professional summary (leave blank to auto-generate from your profile)
        </label>
        <textarea className={inputCls} rows={4} value={profile.summary} onChange={(e) => set("summary", e.target.value)} />
      </section>

      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
