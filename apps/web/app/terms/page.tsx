import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata = { title: "Terms of Service — Apply4You" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="July 2026">
      <p>
        By using Apply4You you agree to these terms. They describe what the service does, what you&apos;re
        responsible for, and the limits of what we promise.
      </p>

      <LegalSection heading="What the service does">
        <p>
          Apply4You finds job postings that match your profile, fills out application forms using the
          information in your profile, and — after you review and approve each one — submits them to the
          hiring company&apos;s application system on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="You authorize submissions">
        <p>
          When you approve an application, you authorize us to submit it to that company as you, using your
          real information. You are responsible for reviewing what will be sent. You confirm that the
          information in your profile is truthful and yours to use. We fill forms only from your profile and
          never fabricate answers, but the final submission is yours.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Use Apply4You for your own genuine job search. Don&apos;t use it to submit false information, to apply
          on someone else&apos;s behalf without their consent, or in a way that violates the terms of the job
          boards or applicant tracking systems involved.
        </p>
      </LegalSection>

      <LegalSection heading="No guarantee of outcomes">
        <p>
          We help you apply to more jobs with less effort. We do not guarantee interviews, responses, or
          offers, and we do not control the companies you apply to or the applicant tracking systems that
          receive your applications. Some submissions may fail (for example, when a form requires a step we
          can&apos;t complete automatically); when that happens we tell you and give you a link to apply
          manually.
        </p>
      </LegalSection>

      <LegalSection heading="Plans and limits">
        <p>
          Your plan sets how many applications you can submit per period, and a daily cap limits how many go
          out per day. These limits protect you and the systems we submit to.
        </p>
      </LegalSection>

      <LegalSection heading="Your data and account">
        <p>
          You own your data. You can export it or delete your account at any time, as described in our{" "}
          Privacy Policy. We may suspend accounts that abuse the service or put the platform at risk.
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          The service is provided &quot;as is.&quot; To the extent permitted by law, Apply4You is not liable for
          indirect or consequential damages arising from your use of the service, including missed
          opportunities or errors in submitted applications that you had the opportunity to review.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these terms as the product evolves. Material changes will be reflected in the
          &quot;last updated&quot; date, and continued use means you accept them.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>support@apply4you.example.</p>
      </LegalSection>
    </LegalShell>
  );
}
