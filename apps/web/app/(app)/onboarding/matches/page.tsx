import { OnboardingSteps } from "@/components/onboarding-steps";
import { OnboardingMatches } from "@/components/onboarding-matches";

/** Step 4: live "finding your matches" — waits for the match engine, then auto-queues. */
export default function OnboardingMatchesPage() {
  return (
    // Same masthead as the other wizard steps: step rail on top, .display H1,
    // one ink-soft line under it. The reading column is `max-w-3xl` — step 1/2
    // run a 1080px frame only because they carry a second (guardrails) column,
    // and this step has one column, as step 3 does. No wordmark: the app shell
    // already puts it in the rail.
    <div className="mx-auto max-w-3xl">
      <OnboardingSteps current={4} className="mb-10" />
      <h1 className="display text-[28px] text-ink sm:text-[34px]">Meet your matches</h1>
      <p className="mt-3 max-w-2xl text-[15.5px] leading-[1.55] text-ink-soft">
        We score every open job against your profile and preferences. Nothing is ever submitted
        without your approval.
      </p>
      <div className="mt-8">
        <OnboardingMatches />
      </div>
    </div>
  );
}
