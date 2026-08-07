import { createClient } from "@/lib/supabase/server";
import { rowToPreferences, type PreferencesRow } from "@/lib/profile";
import { PreferencesForm } from "@/components/preferences-form";
import { AnswerLibraryForm } from "@/components/answer-library-form";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { cardCls } from "@/components/ui";

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { onboarding } = await searchParams;
  const supabase = await createClient();
  const [{ data: row }, { data: profileRow }] = await Promise.all([
    supabase.from("preferences").select("*").single<PreferencesRow>(),
    supabase.from("profiles").select("answer_library").maybeSingle<{ answer_library: Record<string, string> | null }>(),
  ]);

  if (!row) {
    return (
      <div className={`${cardCls} px-6 py-6`}>
        <p className="text-[14.5px] leading-[1.6] text-ink-body">
          Preferences not found — try signing out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {onboarding && <OnboardingSteps current={3} />}
      <h1 className="display text-[30px] text-ink sm:text-[34px]">Job preferences</h1>
      <p className="mb-6 mt-2 max-w-2xl text-[15.5px] leading-[1.55] text-ink-soft">
        What should we look for? Jobs are matched and ranked against these.
      </p>
      <PreferencesForm initial={rowToPreferences(row)} redirectTo={onboarding ? "matches" : undefined} />

      {!onboarding && (
        <section className="mt-14">
          <h2 className="display text-[24px] text-ink">Your answers</h2>
          <p className="mb-5 mt-2 max-w-2xl text-[14.5px] leading-[1.6] text-ink-body">
            The questions employers ask that a CV can&apos;t answer. Fill these in once and we stop
            having to come back to you for them.
          </p>
          <AnswerLibraryForm initial={profileRow?.answer_library ?? {}} />
        </section>
      )}
    </div>
  );
}
