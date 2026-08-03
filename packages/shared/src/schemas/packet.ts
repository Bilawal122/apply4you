import { z } from "zod";
import type { Profile } from "./profile.js";

/**
 * Per-job tailored CV (task #40, VISION §2 "application packet").
 *
 * The model does NOT rewrite the candidate's experience. It returns a
 * SELECTION — which roles, which bullets within them, which skills, in what
 * order — as indices into the profile it was given. The renderer then emits
 * the candidate's own strings, looked up by index.
 *
 * That makes fabricated experience structurally impossible rather than merely
 * forbidden by prompt wording, which is the same guarantee the field resolver
 * gives (FR-14–16). `summary` is the single generated field, because a profile
 * summary is already AI-written and user-editable everywhere else in the app.
 */
export const TailoredCvSchema = z.object({
  /** Tailored profile summary. The only free text the model produces here. */
  summary: z.string(),
  /** Roles to show, in display order, each with the bullets worth keeping. */
  roles: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      bulletIndices: z.array(z.number().int().nonnegative()),
    }),
  ),
  skillIndices: z.array(z.number().int().nonnegative()),
  educationIndices: z.array(z.number().int().nonnegative()),
  /** One line, shown to the user only — why this shape for this job. */
  rationale: z.string(),
});

export type TailoredCv = z.infer<typeof TailoredCvSchema>;

/** A tailored CV with every index already resolved to real profile content. */
export interface ResolvedCv {
  summary: string;
  rationale: string;
  roles: Array<{ company: string; title: string; start: string; end: string; bullets: string[] }>;
  skills: string[];
  education: Array<{ school: string; degree: string; field: string; start: string; end: string }>;
  /** Bullets/roles the selection left out — surfaced so the user can see what was dropped. */
  omitted: { roles: number; bullets: number; skills: number };
}

const inRange = (i: number, len: number): boolean => Number.isInteger(i) && i >= 0 && i < len;

/**
 * Maps a selection back onto the profile. Any index the model invented that
 * doesn't exist is silently discarded — the backstop that keeps a hallucinated
 * index from becoming a hallucinated job. Falls back to the full profile when
 * the selection is empty, so a bad response degrades to "your CV as-is" rather
 * than to a blank document.
 */
export function resolveTailoredCv(profile: Profile, cv: TailoredCv): ResolvedCv {
  const seenRoles = new Set<number>();
  const roles = cv.roles
    .filter((r) => inRange(r.index, profile.workHistory.length) && !seenRoles.has(r.index) && seenRoles.add(r.index))
    .map((r) => {
      const src = profile.workHistory[r.index]!;
      const picked = [...new Set(r.bulletIndices)]
        .filter((b) => inRange(b, src.bullets.length))
        .map((b) => src.bullets[b]!);
      return {
        company: src.company,
        title: src.title,
        start: src.start,
        end: src.end,
        // Never emit a role with no bullets at all — show its own bullets instead.
        bullets: picked.length > 0 ? picked : src.bullets,
      };
    });

  const skills = [...new Set(cv.skillIndices)]
    .filter((i) => inRange(i, profile.skills.length))
    .map((i) => profile.skills[i]!);

  const education = [...new Set(cv.educationIndices)]
    .filter((i) => inRange(i, profile.education.length))
    .map((i) => profile.education[i]!);

  const finalRoles = roles.length > 0 ? roles : profile.workHistory;
  const finalSkills = skills.length > 0 ? skills : profile.skills;
  const finalEducation = education.length > 0 ? education : profile.education;

  const keptBullets = finalRoles.reduce((n, r) => n + r.bullets.length, 0);
  const allBullets = profile.workHistory.reduce((n, r) => n + r.bullets.length, 0);

  return {
    summary: cv.summary.trim() || profile.summary,
    rationale: cv.rationale,
    roles: finalRoles,
    skills: finalSkills,
    education: finalEducation,
    omitted: {
      roles: Math.max(0, profile.workHistory.length - finalRoles.length),
      bullets: Math.max(0, allBullets - keptBullets),
      skills: Math.max(0, profile.skills.length - finalSkills.length),
    },
  };
}
