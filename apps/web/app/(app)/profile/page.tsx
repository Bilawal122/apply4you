import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rowToProfile, type ProfileRow } from "@/lib/profile";
import { ProfileForm } from "@/components/profile-form";
import { DangerZone } from "@/components/danger-zone";
import { Eyebrow, Tick, btnLink, cardCls, cardDarkCls } from "@/components/ui";

/**
 * Every line here is something the code actually does, and each one is already
 * stated somewhere else in the product — the onboarding copy, the privacy page,
 * the approval gate, and the demographic-field refusal in
 * app/(app)/applications/actions.ts. Nothing on this card is aspirational.
 */
const GUARDRAILS = [
  "Every application is filled from this profile. We never invent answers that aren't in it.",
  "Nothing is submitted until you approve it.",
  "When there is no profile-backed answer, we flag the gap instead of guessing.",
  "Demographic and equal-opportunity questions are never machine-answered.",
];

/** A document, for the CV row. Stroke uses tokens so it tracks the palette. */
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-4Z"
        stroke="var(--color-ink-faint)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4" stroke="var(--color-ink-faint)" strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d="M9 12.5h6M9 15.5h4"
        stroke="var(--color-ink-faint)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: row } = await supabase.from("profiles").select("*").single<ProfileRow>();
  const { data: claimsData } = await supabase.auth.getClaims();

  const profile = row ? rowToProfile(row) : null;

  // The account this browser is signed in as. Falls back to the profile's own
  // email rather than showing a blank identity card. Never a placeholder.
  const claimEmail = claimsData?.claims?.email;
  const accountEmail =
    typeof claimEmail === "string" && claimEmail ? claimEmail : profile?.email || null;

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  const initials =
    `${profile?.firstName?.trim().charAt(0) ?? ""}${profile?.lastName?.trim().charAt(0) ?? ""}`.toUpperCase() ||
    (accountEmail?.trim().charAt(0).toUpperCase() ?? "");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="display max-w-3xl text-[28px] text-ink sm:text-[34px]">
        Your profile is the only thing we answer from
      </h1>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.6] text-ink-body">
        The single source of truth for every application — we never invent answers that aren&apos;t
        in it.
      </p>

      <div className="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className={`${cardCls} px-5 py-6 sm:px-7`}>
          <Eyebrow>Facts we reuse</Eyebrow>
          <div className="mt-5">
            {profile ? (
              <ProfileForm initial={profile} />
            ) : (
              <p className="text-[14.5px] leading-[1.6] text-ink-body">
                No profile yet.{" "}
                <Link href="/onboarding" className={btnLink}>
                  Start by uploading your resume.
                </Link>
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className={`${cardCls} px-5 py-6 sm:px-6`}>
            <div className="flex items-center gap-3.5">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-[15px] font-semibold tracking-[0.02em] text-lime-ink"
                aria-hidden="true"
              >
                {initials}
              </span>
              <div className="min-w-0">
                {fullName ? (
                  <p className="truncate text-[17px] font-bold tracking-[-0.02em] text-ink">
                    {fullName}
                  </p>
                ) : (
                  <p className="text-[15px] text-ink-soft">No name on file yet</p>
                )}
                {accountEmail && (
                  <p className="truncate font-mono text-[12px] text-ink-faint" title="Signed in as">
                    {accountEmail}
                  </p>
                )}
              </div>
            </div>

            {/*
              The CV row deliberately carries no upload date: the profiles table
              records resume_filename but not when it landed, and updated_at is
              the profile's own timestamp, not the file's. Better a missing line
              than a plausible-looking wrong one.
            */}
            <div className="mt-5 flex items-center gap-3 border-t border-line-soft pt-4">
              <DocIcon />
              <div className="min-w-0 flex-1">
                <p className="label-mono">CV on file</p>
                {row?.resume_filename ? (
                  <p
                    className="truncate font-mono text-[13px] text-ink"
                    title={row.resume_filename}
                  >
                    {row.resume_filename}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-soft">None yet</p>
                )}
              </div>
              <Link href="/onboarding" className={`${btnLink} shrink-0`}>
                {row?.resume_filename ? "Replace" : "Upload"}
              </Link>
            </div>
          </section>

          <section className={`${cardDarkCls} px-5 py-6 sm:px-6`}>
            {/*
              `.label-mono` hard-sets ink-soft, which is unreadable here, so the
              eyebrow is spelled out rather than overridden.
            */}
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-on-slate-faint">
              Guardrails
            </p>
            <ul className="mt-4 flex flex-col gap-3.5">
              {GUARDRAILS.map((line) => (
                <li key={line} className="flex gap-3">
                  <Tick className="mt-[3px] h-3.5 w-3.5" />
                  <span className="text-[13.5px] leading-[1.55] text-on-slate-soft">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <DangerZone />
    </div>
  );
}
