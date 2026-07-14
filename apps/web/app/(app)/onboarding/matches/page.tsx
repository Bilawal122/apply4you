import { OnboardingSteps } from "@/components/onboarding-steps";
import { OnboardingMatches } from "@/components/onboarding-matches";

/** Step 4: live "finding your matches" — waits for the match engine, then auto-queues. */
export default function OnboardingMatchesPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-10">
      <OnboardingSteps current={4} />
      <OnboardingMatches />
    </div>
  );
}
