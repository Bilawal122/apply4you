import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata = { title: "Privacy Policy — Apply4You" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="July 2026">
      <p className="text-[16.5px] leading-[1.65]">
        This policy explains what Apply4You collects, why, and the control you have over it. It is written
        to be read, not to hide behind. If anything here is unclear, email us before you sign up.
      </p>

      <LegalSection heading="What we collect">
        <p>
          Your account email, the resume you upload, and the profile we extract from it (work history,
          education, skills, contact details, links, and work-authorization status). We also store the job
          preferences you set and a record of every application we prepare or submit on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>
          Your profile is the single source of every application. We send relevant parts of it to our AI
          provider (Google Gemini) to match you to jobs and to fill out application forms. We never invent
          information that isn&apos;t in your profile — fields we can&apos;t answer from it are left blank for you to
          complete. We do not sell your data or use it to train external models.
        </p>
      </LegalSection>

      <LegalSection heading="Where it goes">
        <p>
          Applications are submitted to the applicant tracking systems of the companies you choose
          (Greenhouse, Lever, Ashby, Workable). The information you&apos;d expect on a job application — your
          name, contact details, resume, and your answers — is sent to those companies when you approve an
          application. Nothing is submitted without your approval.
        </p>
        <p>
          We never submit to, or store credentials for, LinkedIn or Indeed. We use them only to read public
          job listings.
        </p>
      </LegalSection>

      <LegalSection heading="Storage and security">
        <p>
          Data is stored in Supabase (Postgres and encrypted object storage) with row-level security so
          your records are only accessible to you. Resumes live in a private bucket. Access tokens for our
          AI and infrastructure providers are held server-side and never exposed to your browser.
        </p>
      </LegalSection>

      <LegalSection heading="Your control">
        <p>
          You can export everything we hold about you as a single file from your profile page at any time,
          and you can delete your account permanently — which removes your profile, resume, applications,
          and all associated records. Deletion is immediate and irreversible.
        </p>
      </LegalSection>

      <LegalSection heading="Third parties we rely on">
        <p>
          Supabase (database, auth, storage), Google Gemini (AI), and our hosting providers. Each processes
          data only to provide their service to us. We add new processors only when needed to run the
          product.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions or requests about your data: support@apply4you.example.</p>
      </LegalSection>
    </LegalShell>
  );
}
