# Product Decision Log

Decisions are numbered and dated; they stand until explicitly superseded by a
later entry. Format: decision → rationale → what it unblocks/kills.

---

## 2026-07-17 — Strategy set for the road to first real users

Context at decision time: core loop validated end-to-end on production
(signup → parse → criteria → 100 matches → auto-queue 10 → AI-filled in ~30s,
review-gated, nothing submitted). Real submission never yet executed. Zero
external users. Solo bootstrapped founder, himself actively job-hunting (the
target user). Cost incidents: idle BullMQ worker burned ~$6 of pay-per-command
Redis in 2 days. DB: 17.9k jobs (free-tier ceiling in sight). Drafted by the
founder's agent, pressure-tested by an adversarial panel (bootstrapper / user
advocate / risk), amendments incorporated.

### D1 — Launch strategy: dogfood-first, with teeth
The founder is user #1. His real job search runs through the product before any
external user. **Rules that make it a real test, not a vibe:** dogfood starts
the day of the first real submission and hard-stops **2 weeks** later; every
eligible Greenhouse-hosted job in his search goes through the product;
**manual-bypass rate is a first-class metric** (<80% adherence = the product is
failing its own founder — investigate, don't excuse). First 10–15 real
submissions go to practice-tier jobs; dream-tier companies stay manual early
(and live on the blocklist, see D3), then a defined share of top-desire
applications must flow through the product so the test isn't adversely
selected. What 2 weeks validates: mechanics, fill fidelity, cost. Employer
responses get a parallel **6-week observation window** with his manual
applications logged as an informal comparison arm — never a launch gate.
Recruit the 5–10 friend waitlist **now** (one group-chat message) so the friends
phase has no serial delay. Copy rule: auto-queued items are "drafts prepared
for your review — nothing is sent without you."

### D2 — Infra posture: flat-rate Redis, attended local worker, $0 until friends
Kill Upstash (per-command billing is structurally wrong for BullMQ's blocking
polls — the $6 lesson). Redis becomes a **Railway service** (flat pricing,
~$5/mo Hobby is the first accepted fixed burn); repoint `REDIS_URL` on worker +
Vercel; **drain or consciously discard the ~10 parked jobs before deleting the
Upstash DB**. For the dogfood phase the worker runs **on the founder's own PC,
attended, on demand**: $0, second-level latency, residential IP (a datacenter
ASN would make bot-detection risk unrepresentative), and the founder watches
the logs of every first real submission live. No cron-burst engineering — that
was infrastructure procrastination. Hosted always-on worker returns only when
the friends gate passes. Everything else stays free-tier.

### D3 — Submission rollout: safety pack, then Greenhouse-only, time-boxed gate
No real submission until the **pre-submission safety pack** is live:
1. **Company blocklist** — one table, seeded with the founder's out-of-tool
   applications (Figma, …), hard-excluded from auto-queue and submit.
2. **Stuck-submitting reconciliation** — on worker start, any row in
   `submitting` older than N minutes → `needs_manual_verification`; never
   auto-requeued. Postgres is the source of truth, not Redis.
3. **Success screenshots** — confirmation page captured on success, not just
   failure.
4. **Staleness guard** — re-fetch the posting at submit time; closed/changed →
   fail gracefully as `posting_closed`.
5. **EEOC/demographic/special-category fields are NEVER auto-filled** — any
   ATS, any user, forever.
6. **Required-field pre-flight** — if any required field can't be mapped to a
   known type, the application parks for manual completion; no best-effort
   fills on real employers.
7. **Circuit breaker** — 2–3 consecutive captcha/bot-wall/failures on an ATS
   auto-pauses that ATS's queue; manual re-arm. Captcha-rate-per-board is the
   leading ban indicator.
8. **Sentry (free tier) on the worker** — this codebase already produced two
   classes of invisible failure; the machine is about to click submit on real
   applications.
9. **Pacing** — submissions spaced minutes apart with jitter; daily cap stays
   at 10 until edit-rate data exists.

The validation gate (#15) is **time-boxed to 5 days** with two acceptable
exits: (a) a $0 self-serve **Workable trial board** we own — live submit +
duplicate-refused + captcha-records-failed tests against our own board; and/or
(b) **one supervised real Greenhouse submission** — a genuinely low-stakes
posting the founder would apply to anyway, every field reviewed, headful, screen
recorded, verified by confirmation email. Either exit clears the gate.
Greenhouse-only until each other ATS passes its own validation. Full-auto mode
stays off for everyone, founder included; any future auto-submit requires an
explicit per-user opt-in.

### D4 — Scope: cuts, a reversal, and one un-deferral
**Deferred:** Stripe (no one to charge), email notifications (founder checks
the dashboard — but shipping failure/needs-review notifications is a hard
precondition of the friends gate), full-auto mode, browser extension, tier-2
ATSs. **Reversed:** the "expand to 1000+ boards" ambition — capped at ~300
active boards; freshness beats volume at n=1 and the DB is the free-tier wall.
**Added instead: data retention** — at submit time, snapshot the full job
description + all submitted fields into the application record (immutable,
kept indefinitely — interview prep lands 4–8 weeks out and the audit trail of
what the bot told employers must survive); then purge unapplied closed jobs
and their embeddings after 30 days. **Un-deferred:** Sentry on the worker
(D3.8).

### D5 — Segment bet: UK grads + visa-sponsorship seekers (verify coverage first)
The beta wedge is the founder's own network: UK graduates and international
students needing Skilled Worker sponsorship — desperate, high-intent,
underserved. **Not built yet**, but the go/no-go data check runs THIS WEEK:
join our 17.9k jobs / ~300 boards against the public gov.uk sponsor-licence
register (free CSV), UK roles split by ATS. If licensed-sponsor coverage is
thin (<~15% of boards), the wedge demands a different ATS roadmap and that must
be known before the friends cohort is chosen. When the sponsor filter (#27) is
built: conservative labeling only ("holds a Skilled Worker sponsor licence —
Home Office register as of <date>", never "sponsors this role"), register
snapshot date logged per match, company-name canonicalization (#28) treated as
a near-prerequisite. Until it exists, **no visa-dependent friends are invited**
(or the first cohort is explicitly home-status-only and told so).

> **D5 coverage check — RESULT (2026-07-25): GO.** Matched all 294 active
> boards against the gov.uk Worker/Temporary Worker register (2026-07-24
> edition, 125,679 orgs, exact-normalized name matching): **28% of boards hold
> a licence** (vs the <15% kill line) and **63% of our 1,270 UK-located open
> jobs sit at licensed sponsors** (800 jobs) — and that's a floor, since
> legal-entity mismatches (Stripe/GitLab/Datadog-class names) read as false
> negatives without canonicalization (#28). Greenhouse is the richest licensed
> segment (36/73 boards, 372 UK jobs), independently validating the
> Greenhouse-first rollout in D3. Workable is small but dense (90% of its UK
> jobs at licensed sponsors). The wedge stands; no ATS-roadmap change needed.

### D6 — Gates and metrics (product-controlled things gate; slow things get tracked)
- **Founder real submissions unlock when:** D3 gate cleared (either exit) +
  blocklist live + Sentry-on-worker live.
- **Friends (5–10) unlock when ALL of:** ≥90% submission success across
  **≥20–25 genuine** Greenhouse submissions (every one passing the "would I
  have applied manually?" test — a volume floor of 50 was rejected because it
  pressures spamming real employers); zero-fabrication audit clean on a 20-app
  sample; confirmation-email-received ≥95%; failure + needs-review
  notifications shipped; circuit breaker live; **UK GDPR readiness done**
  (privacy notice, ICO data-protection fee, DPA inventory for
  Supabase/Google/Vercel/Railway, tested one-click account+data deletion
  including vectors, explicit Gemini-processing disclosure).
- **Stripe:** built at ≥5 weekly-active external users, not before.
- **Tracked, never gates:** employer responses (6-week window, manual log,
  compared to manual applications), cost per application (<$0.02 watch line),
  median time-in-review and edit-rate on AI free text (**<10s median review is
  a red flag equal to a failed submission** — the review gate must stay real).
  *Instrumented 2026-08-04 (IMPROVEMENTS C2): `applications.review_metrics`,
  surfaced as the dashboard's Review quality panel. Bulk approvals count as a
  real 0-second review rather than being excluded, so the median cannot be
  flattered by the one behaviour this metric exists to catch. Held below 5
  samples — a median off two approvals is noise.*
- **Kill/pivot condition, decided now:** if after ~25 genuine attempts (plus
  the fixes they trigger) Greenhouse submission success can't reach 90%,
  headless submit is the wrong architecture — pivot to assisted-fill
  (extension/copilot mode, task #30) rather than fighting bot detection.
