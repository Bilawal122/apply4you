import { createClient } from "@/lib/supabase/server";
import { rowToPreferences, type PreferencesRow } from "@/lib/profile";
import { PreferencesForm } from "@/components/preferences-form";
import { AnswerLibraryForm } from "@/components/answer-library-form";
import { OnboardingSteps } from "@/components/onboarding-steps";

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
    return <p className="text-sm text-neutral-500">Preferences not found — try signing out and back in.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {onboarding && <OnboardingSteps current={3} />}
      <h1 className="text-xl font-semibold text-ink">Job preferences</h1>
      <p className="mb-6 mt-1 text-sm text-ink-soft">
        What should we look for? Jobs are matched and ranked against these.
      </p>
      <PreferencesForm initial={rowToPreferences(row)} redirectTo={onboarding ? "matches" : undefined} />

      {!onboarding && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="display text-xl text-ink">Your answers</h2>
          <p className="mb-6 mt-1.5 text-sm text-ink-soft">
            The questions employers ask that a CV can&apos;t answer. Fill these in once and we stop
            having to come back to you for them.
          </p>
          <AnswerLibraryForm initial={profileRow?.answer_library ?? {}} />
        </section>
      )}
    </div>
  );
}
