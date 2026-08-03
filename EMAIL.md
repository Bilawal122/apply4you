# Email integration plan

*Written 2026-08-03. Answers "email integration and inbox" (VISION.md §2d,
task #21, ROADMAP.md 1.3). Phase 1 below is implemented, not just planned.*

## Why three phases, not one build

"Email integration" conflates two very different problems that happen to
both involve email:

1. **Telling the user something happened** (outbound) — a solved problem,
   one API call, no third-party approval.
2. **Knowing when an employer replies** (inbound) — reading mail you don't
   control, which either means owning a domain's inbound routing (moderate
   effort) or getting Google/Microsoft to trust us with a user's real inbox
   (weeks of security review, ongoing compliance cost).

Building both at once means the hard 10% (inbound) blocks the easy 90%
(outbound) from shipping. Splitting them means the D6 friends-gate
requirement — "notifications live" — ships this week instead of waiting on
a Google security review that hasn't even started.

---

## Phase 1 — Outbound notifications — **SHIPPED 2026-08-03**

**What it does:** the worker emails the user's account address (from
`auth.users`, via `supabaseAdmin().auth.admin.getUserById`, not the profile's
`email` field — those can differ, and the account address is the one they
actually check) at the two real terminal events in the submission pipeline:

- **Submitted** — "Applied: {title} at {company}", with a link back to the
  original posting.
- **Failed** — "Needs attention: {title} at {company}", naming the reason
  (captcha, posting closed, no résumé on file, etc.) and pointing back to the
  dashboard, where the full failure detail and an "apply manually" link
  already exist.

**Where:** [apps/worker/src/notify.ts](apps/worker/src/notify.ts) (new),
wired into the two terminal branches of `submitApplication()` in
[apps/worker/src/processors/submit.ts](apps/worker/src/processors/submit.ts)
— the `submitted` status update and the shared `fail()` closure, so every
current and future failure reason gets covered automatically with no
per-reason wiring.

**Provider:** [Resend](https://resend.com) — free tier covers 3,000
emails/month, comfortably above dogfood/friends-beta volume. No SDK
webhook/inbound handling used in this phase, just `emails.send()`.

**Safety — mirrors the existing `SENTRY_DSN` pattern exactly:**
`RESEND_API_KEY` unset → the module never loads the SDK and every call is a
silent no-op. Nothing about the submission pipeline depends on email
succeeding; a `send()` failure is caught and logged, never thrown. This
means the feature is live in every environment right now (including this
dev machine, which has no Resend account) without sending a single real
email until a real account is configured — the "real, not just planned"
bar the user asked for.

**Config added** ([.env.example](.env.example)): `RESEND_API_KEY` (blank —
get one at resend.com, verify a sending domain or use their shared
`onboarding@resend.dev` for testing), `NOTIFY_FROM_EMAIL` (defaults to
`Apply4You <notifications@apply4you.app>` — will bounce/fail until that
domain is verified in Resend; harmless while the key itself is unset).

**Explicitly not built in Phase 1** (kept out to stay minimal): a
notification-preferences toggle, digest/batching mode, or unsubscribe
flow. These are transactional emails tied to an action the user themselves
triggered (approving an application) — not marketing — so they don't need
opt-in under UK GDPR/PECR. Revisit if daily-cap volume ever makes
per-submission emails feel noisy (a "digest instead of per-event" toggle is
the natural fix, gated on `preferences`).

**Remaining before this can go live for real:** 🧑 create a Resend account,
verify a sending domain (or accept `onboarding@resend.dev` for the dogfood
window), set `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL` in the worker's env
(local `.env` for attended dogfood runs, Railway once the worker is
hosted). Confirmation-email delivery is itself a D6 friends-gate exit
criterion ("Confirmation email received for ≥95% of submissions") — the
dogfood window is exactly where this gets proven.

---

## Phase 2 — In-app inbox via forwarding alias (build during/after friends beta)

**Problem it solves:** Phase 1 tells the user what *we* did. It says
nothing about what happens next — whether an employer replied, rejected, or
asked for an interview. Task #29 (interview & response tracking) needs that
signal, and it's the input the whole "why this score band converts to
interviews" analysis (VISION §4b item 7) depends on.

**Design (not yet built):**

1. Each user gets a stable forwarding alias — `u-{short-user-id}@reply.apply4you.com`
   — generated at signup, stored on `profiles` (or a new 1:1 table).
2. Two ways it fills up:
   - Set as the **reply-to** on record wherever an ATS lets the applicant
     set one (rare, but Greenhouse/Lever sometimes surface a contact-email
     field).
   - The user manually forwards an employer email to their alias (works
     regardless of ATS — no adapter changes needed, so it's viable even
     before every ATS supports it directly).
3. **Inbound receiving:** a domain (`reply.apply4you.com`) with MX records
   pointed at Resend's inbound webhook (Resend added inbound email support
   in 2025 — verify current API shape against `resend.com/docs` before
   building, per the project's "Supabase changes frequently, verify docs"
   habit applied to any external API). The webhook hits a new
   `/api/email/inbound` route: parses the `To` alias back to a `user_id`,
   best-effort matches the email to an `application` (sender domain vs.
   `jobs.company` / `job_snapshot.company`, falling back to "unmatched —
   pick the application" if no confident match), and inserts a row into a
   new `employer_replies` table (`application_id`, `user_id`, `from`,
   `subject`, `body_text`, `received_at`).
4. **UI:** a new **Inbox tab** — list of replies, each linked to its
   application; an "unmatched" bucket with a one-click "attach to
   application" picker for the cases the auto-match misses.
5. **Powers task #29 directly:** `employer_replies.received_at` minus
   `applications.submitted_at` = response latency; presence of a reply at
   all (vs. a defined "no response after N days") = the interview-rate
   number the whole marketing plan (VISION §2e concept C, ROADMAP 3.7) is
   waiting on.

**Effort estimate:** ~1 week (domain/DNS + inbound webhook + matching
heuristic + Inbox UI). No third-party approval process — this is Resend
(already Phase 1's provider) handling inbound mail on a domain we own, not
reading anyone's real inbox.

**Trigger to start:** friends-beta phase (ROADMAP Phase 2), once Phase 1
has proven out in dogfood and there are enough real applications in flight
for response-tracking data to mean anything.

---

## Phase 3 — Full Gmail/Outlook OAuth inbox sync (post-revenue only, not started)

**What it would add over Phase 2:** zero-setup for the user — no alias to
remember, no manual forwarding — by reading their actual inbox for
employer-domain replies.

**Why it's deliberately last:**
- Google's CASA (Cloud Application Security Assessment) is required for any
  app requesting Gmail read scopes beyond the most restrictive, and takes
  weeks and can cost real money annually for a small app.
- It's a materially larger data-protection liability (third-party access to
  a user's entire inbox, not just what they choose to forward) — a
  pre-revenue product with no legal/compliance function shouldn't carry
  that risk per DECISIONS.md's general risk posture.
- Every competitor researched for COMPETITORS.md gates this same feature
  behind revenue/scale for the same reasons — this isn't us being
  conservative for no reason, it's the category norm.

**Trigger to start:** post-Stripe (ROADMAP Phase 4+), and only if Phase 2's
forwarding-alias inbox turns out to have real adoption friction (most users
never set up the forward) that justifies the CASA cost.

---

## Summary for tracking

| Phase | Status | Task | Effort |
|---|---|---|---|
| 1. Outbound notifications | **Shipped 2026-08-03**, needs 🧑 Resend account to go live | #21 | done |
| 2. Forwarding-alias inbox | Planned, not started | #29 | ~1 week |
| 3. Gmail/Outlook OAuth | Planned, deliberately deferred | — | weeks + ongoing cost |
