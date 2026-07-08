import { createClient } from "@/lib/supabase/server";
import { rowToPreferences, type PreferencesRow } from "@/lib/profile";
import { PreferencesForm } from "@/components/preferences-form";
import { OnboardingSteps } from "@/components/onboarding-steps";

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { onboarding } = await searchParams;
  const supabase = await createClient();
  const { data: row } = await supabase.from("preferences").select("*").single<PreferencesRow>();

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
      <PreferencesForm initial={rowToPreferences(row)} redirectTo={onboarding ? "feed" : undefined} />
    </div>
  );
}
