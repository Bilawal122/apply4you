# Competitor Dossier — who they are, how they work, how they make money

*Research date 2026-07-27/28. Two multi-agent sweeps: (1) products, mechanics,
pricing, complaints; (2) growth/acquisition playbooks. The curated highlights
live in [VISION.md](VISION.md) §4; this file is the full detail. Money
strategy for us: VISION.md §5–6 + the GTM playbook at the end of this file.*

---

## The market map

The space splits into four camps:

1. **Volume auto-appliers** (LazyApply, LoopCV, AIApply's agent, JobRight's
   agent) — spray applications with little or no review. Weakest reputations
   in the category; their 1-star reviews are our positioning material.
2. **Assistive copilots** (Simplify, Huntr, Teal, Careerflow) — extensions
   and trackers where *the user* still clicks submit. Better trusted, but
   they stop short of execution.
3. **UK visa-niche list-sellers** (Student Circus, GradCracker, UKVisaJobs,
   SponsorshipJobs.io, VisaPath, UKHired) — filter/verify sponsor jobs but
   **none of them applies for the user**. Verification without execution.
4. **Adjacent monetization machines** (Zety/Resume.io rebill model, TopCV
   human rewrites, Big Interview B2B licensing) — not competitors, but where
   the money patterns come from.

**Our slot — review-gated execution with sponsor verification — is empty in
all four camps.** Camp 1 executes without review. Camp 2 reviews without
executing. Camp 3 verifies without executing. Nobody does all three.

---

## Camp 1 — Volume auto-appliers

### LazyApply — the cautionary tale
- **How it works:** Chrome extension ("Job GPT") running in the user's own
  browser session — auto-fills and auto-**submits** on LinkedIn Easy Apply,
  Indeed Quick Apply, ZipRecruiter, Dice, and Greenhouse. No review gate at
  all: set filters, start the run, it submits unattended. Up to 1,500/day on
  the top tier. Multiple résumé profiles (1/5/20 by tier) cycle different CVs
  by role type. Also generates "referral emails" to company employees.
- **Model:** $99/$149/$999 **per year, upfront, no monthly, no trial**; also
  sold as $99–249 lifetime deals on AppSumo/StackSocial.
- **Reality:** ~2.4/5 Trustpilot, ~56% one-star — the worst reputation in the
  category. Fails at basic fields (first/last name), applies to unrelated
  roles, "everything is so generic." Refunds effectively unhonored. Lifetime
  "unlimited" buyers had their plans retroactively degraded to daily caps.
- **What we take:** multiple CV profiles as a paid-tier axis (their one
  legible idea). Everything else is the anti-pattern: their review pile is
  our landing-page copy. **Never sell "unlimited."**

### LoopCV — persistent search agents + email outreach
- **How it works:** "Loops" = a saved search (title + location + CV +
  filters) that runs daily as a persistent agent across 30+ job boards.
  **Dual-channel**: submits the application AND separately scrapes
  recruiter/company email addresses, then sends a personalized templated
  email with CV attached — reaching humans before/instead of the ATS queue.
  Full-auto or semi-auto per loop.
- **Model:** Free (1 title, 10 apps/mo) → $19.99/mo (100 apps) → $59.99
  (300 + screening-question autofill) → **$89.99/mo "Done For You" with
  weekly human calls**. Recurring ~$39 lifetime deals on AppSumo.
- **Reality:** full-auto horror stories — emails sent to CEOs about roles
  that weren't open; applies to ghost jobs and mismatched positions; one
  person's name across dozens of wrong roles at one company reads as spam
  and burns future chances there.
- **What we take:** the "loops" mental model (named, persistent matching
  profiles — stickier than a one-shot feed); the Done For You tier (anxious
  grads pay ~£80/mo for human-in-the-loop with near-zero extra engineering);
  review-gated recruiter outreach as a later parallel channel. And the
  anti-pattern: per-company rate limiting, surfaced in-product.

### AIApply — the toolkit + credits model
- **How it works:** full toolkit (AI résumé builder, ATS scanner, cover
  letters, mock interviews, live "Interview Buddy" coaching copilot, résumé
  translator in 50+ languages, job board). Auto-apply is more targeted than
  LazyApply — scans LinkedIn/Indeed/Glassdoor/company pages, generates a
  **tailored résumé + cover letter per job** before submitting. Review is
  *optional* — users can turn it on.
- **Model:** ~$29/mo toolkit (~$16 annual) but **auto-apply costs extra via
  credits** (~$39–60/100 applications) → realistic all-in ~$68–89/mo. No
  prices on the public site.
- **Reality:** bait pricing is the top complaint ("$2/week" framing billed
  as $99 upfront); **F rating with the BBB**; 38% custom-question failure
  rate is publicly documented.
- **What we take:** per-job tailored résumé + cover letter (now our task
  #40, behind a mandatory review gate instead of an optional one); interview
  tooling as a 2x-price anchor tier. Anti-pattern: hidden pricing.

### JobRight.ai — the closest analogue, and proof of the visa wedge
- **How it works:** aggregates 8M+ listings (~400k new/day), match score per
  job (same 0–100 UX as ours), "Orion" conversational copilot (free —
  explains matches, preps interviews), and "Jobright Agent": one-click
  tailored CV ("6-second tailored CV") → fills → submits → tracks. Marketed
  as "90% job search automation." Chrome extension for autofill.
- **Model:** free tier with **daily-reset credits** (midnight reset, no
  rollover — a habit + urgency mechanic) → Turbo $17.99/wk, $39.99/mo, or
  $89.99/quarter. Checkout countdown timers.
- **Reality:** **the H1B (US visa) filter alone drove ~50k organic users** —
  direct proof our UK sponsor wedge has demand. But: 18+ documented reports
  of the AI *fabricating* skills/metrics/credentials; ~72% of 1-star reviews
  are billing (charged after cancellation, buried cancel flow); Agent users
  can't see what was submitted where (no audit trail).
- **What we take:** the visa-filter wedge (validated), match-score UX
  (already ours), daily-reset free credits as a conversion mechanic, Orion's
  "explain why you match" (our "why this score" line, VISION.md §2b).
  Anti-patterns: fabrication (our hard rule), no audit trail (our snapshot
  archive), billing dark patterns.

---

## Camp 2 — Assistive copilots

### Simplify — the free-forever autofill standard
- **How it works:** Copilot Chrome extension autofills in the user's browser
  session, "typing visibly as if a fast human" in 2–5s. **Publishes per-ATS
  accuracy tiers: Greenhouse ~90% > Lever ~85% > Ashby ~80% > Workday ~70% >
  iCIMS ~50% > Taleo ~40%** — independently validating our adapter shortlist
  (we picked the top 3 + Workable). Job matching with hard "dealbreakers"
  (min salary, location, **visa sponsorship as a first-class filter**).
  Tracker bookmarks jobs from 50+ boards. The user still clicks Submit.
- **Model:** free forever (autofill + tracker + matches) → Simplify+ at
  $19.99/wk / $39.99/mo / $89.99/quarter for AI generation. No public
  pricing page.
- **Reality:** bimodal reviews — free users love it, payers are the angry
  ones ("glorified autofill", templated AI output). Also a GDPR incident:
  published support conversations containing user PII and refused removal.
- **What we take:** the freemium gate design (tools free, AI/execution
  paid); per-ATS accuracy transparency as trust marketing; visa sponsorship
  as a dealbreaker filter. We are what Simplify+ pretends to be — they
  assist, we execute.

### Huntr — the application-packet originator
- **How it works:** the original job-search CRM (~9 years old): kanban
  tracker, Chrome clipper, contact management, **unlimited application
  autofill free**. "Application packets" bundle tailored résumé + cover
  letter + materials per job. AI scoring beyond keywords: spellcheck +
  quantification analysis of bullets.
- **Model:** generous free tier → Pro $40/mo (~$30 quarterly). Refunds
  hard-capped at 2 invoices; credits expire monthly.
- **What we take:** the **application packet** concept (our task #40 — theirs
  is user-driven and client-side; ours is generated and review-gated);
  keyword-visibility as the paywall lever; their affiliate structure (30% of
  first 3 months, 30-day cookie) as our template.

### Teal — the score-transparency benchmark
- **How it works:** job tracker CRM + résumé builder + **Matching Mode**:
  link a résumé to a saved job → Match Score = % of the JD's key terms
  present, broken into matched/missing/suggested keywords, hard vs soft
  skills, updating in real time as you edit. 80%+ framed as strong.
- **Model:** free (unlimited tracking, ~10 AI credits) → Teal+ $9/wk, $29/mo,
  $79/quarter, $179/yr. The weekly SKU deliberately monetizes desperation
  spikes; it's also their most-criticized line item.
- **Reality:** "won't apply for you" — explicitly assistive. Documented
  fabrication (misspelled users' own names, hallucinated skills). $29/mo
  called too steep for the unemployed — price is the #1 refusal reason
  category-wide.
- **What we take:** the live keyword-gap breakdown UX (feeds our §2b "why
  this score" + the paid-tier gating of the full breakdown).

### Careerflow — the lead-magnet funnel
- **How it works:** free LinkedIn Profile Optimizer + free unlimited résumé
  ATS-score checker as lead magnets → upsell the *fix* into Premium
  ($23.99/mo). Extension bundles tracker + checker + autofill.
- **Reality:** autofill "completely non-functional" per reviews; AI inserts
  incorrect information; credits expire monthly.
- **What we take:** the free-scorer-as-lead-magnet funnel (our main-page
  concept B is exactly this, but with real matched jobs instead of a score).

---

## Camp 3 — The UK visa niche (our wedge, currently unoccupied on execution)

### Student Circus — the B2B2C proof
- Free to students at **75+ partner universities** (Warwick, Imperial,
  Exeter, Nottingham…) — **universities pay the licence**, students get
  ~1,000 pre-filtered sponsored jobs, immigration guides, CV tools.
  Non-partner students hit a 14-day trial cliff.
- Complaints: tiny inventory (~1,000 jobs vs tens of thousands of real
  sponsored roles — we already index more); listings-only, no application
  help, no scoring, no tracking.
- **What we take: the entire business model for our university play.** They
  proved UK universities pay for international-student employability tools.
  We walk in with everything they have *plus* execution.

### The rest, briefly
- **GradCracker** — STEM listings, employer-funded (~350 paying employers);
  visa info is whatever employers write; no tooling. Degree-discipline
  matching is worth copying into our fit score.
- **UKVisaJobs** — **~£17/mo for lists alone**, pricing hidden, "only a
  small handful of jobs" per paying reviewers, ScamDetector 28/100. Proof of
  willingness-to-pay AND of how opacity destroys trust.
- **SponsorshipJobs.io** — the best verification pipeline in the niche
  (licence check → SOC-code eligibility → salary vs £41,700/£33,400
  thresholds, updated hourly) but **no application automation**; its
  aggressive 3-views/day paywall rage-triggered users into its donation
  pivot. Their verification spec is our sponsor-verdict spec.
- **VisaPath** — £9/mo premium over free government data; salary-threshold
  calculator encodes the new-entrant rules we should copy. The niche's
  tooling price floor.
- **UKHired** — the cautionary tale: right idea (auto-applied Home Office
  rules), free model, never monetized, now dormant. Verification without a
  business model dies.

**Niche-wide signal:** every product here derives from the same free public
dataset (the Home Office register + SOC/threshold rules). **The moat is not
the data — it's execution quality and freshness.** The #1 user complaint in
the niche is wasted applications on non-sponsors; #2 is "licensed ≠ willing."
Our answer: never auto-apply to a non-verified sponsor, and surface
"actively sponsoring" signals, not just licence presence.

---

## The four money machines (adjacent patterns, what they teach)

1. **Lifetime-deal launches (AppSumo et al.):** zero-CAC paid acquisition —
   the marketplace takes ~70/30 but delivers thousands of buyers + reviews
   fast. LoopCV runs ~$39 LTDs repeatedly; LazyApply's $249 "unlimited"
   lifetime destroyed them when they degraded it. Rule: **one launch, capped
   seats, consumable quota (N/month for life), never "unlimited."**
2. **The rebill machine (Zety/Resume.io):** $2.95 "trial" → $25–30 every **4
   weeks** (13 charges/year), paywalled at maximum sunk cost, funding huge
   affiliate payouts that buy every "best resume builder" listicle. It
   prints money and poisons trust permanently — we take the *paywall
   placement* lesson (charge at the moment of demonstrated value) and refuse
   the rest.
3. **One-off purchases:** human CV rewrites clear at **$149–349** (TopCV
   ~€250) with "2x interviews or free rewrite" guarantees (in-kind, never
   cash); $5.99 single-scan micro-purchases convert subscription-refusers;
   coaching packs monetize the interview-next-week panic moment.
4. **University B2B licensing (Big Interview, Interstride):** one contract =
   thousands of users, zero consumer CAC; **Interstride proves universities
   pay specifically for international-student employability tooling** — the
   UK analogue is exactly our wedge. Risks: 6–12 month procurement,
   WCAG/security reviews, and licensed tools rotting unused (usage
   dashboards win renewals). Student tech-fee committees are the alternate
   budget line.

**Benchmarks to plan around:** freemium converts ~2–4% in this category
(3.7% SaaS average); weekly billing monetizes desperation at a ~50% premium
but reads predatory; share-link attribution ("look what it applied to for
me") converts ~2x other channels.

---

## How Apply4You makes money — the 90-day growth playbook

*Built from the growth research: how JobRight, Simplify, Teal, Careerflow,
Huzzle, and the UK student platforms actually acquired users, applied to our
exact situation (solo UK student founder, £0 budget, dogfood pending,
September Masters-arrival timing). Total 90-day cash cost: **~£400–1,200**,
mostly society sponsorships + ICO fee + printing.*

### The channels, ranked by expected ROI for us specifically

1. **The sponsor filter + free Sponsorship Checker (product-as-marketing).**
   JobRight's H1B toggle drove 50k users in 2 months with zero spend. Our
   register data is already ingested; the checker ("paste an employer → is it
   licensed, which routes, N live sponsored roles") is the artifact
   international students screenshot into WhatsApp/WeChat groups.
2. **Founder-led content (LinkedIn daily + TikTok screen-demos).** Every
   winner in this niche did it (Simplify, Careerflow, AIApply founders). You
   authentically ARE the ICP. A review-gated agent visibly filling a real
   form is inherently filmable.
3. **International-student societies + WhatsApp groups.** Highest ICP density
   anywhere; £100–150 buys a term of society event sponsorship; September
   Masters arrivals make weeks 6–9 explosive; you have warm campus access no
   competitor has.
4. **Programmatic SEO on register data** (per-company sponsor pages, SOC-code
   pages, salary calculator). Solo projects demonstrably rank in these SERPs
   today; we're the only one with live *applyable* jobs on the page. Payoff
   3–9 months out — plant early.
5. **Reddit helpful-participation** (r/ukvisa, r/UniUK, r/cscareerquestionsUK,
   r/UKJobs) — answers powered by register data are genuinely better than
   anyone else's. Product mention only when asked.
6. **University careers-service listings** — each one is permanent
   institutional endorsement + a .ac.uk backlink. Free via email as a current
   student. (Student Circus built a company on this surface.)
7. **Owned WhatsApp Channel + email alerts** — 5–10 sponsor-verified roles
   daily, auto-generated from the jobs table; matches exactly how this
   audience already consumes job leads.
8. **Data-report PR** — "UK Graduate Visa Sponsorship Report 2026" from our
   proprietary numbers (28% of boards licensed, 63% of UK jobs at licensed
   sponsors) → PIE News, WONKHE, Times Higher.
9. **GitHub auto-updated job-list repo** (nightly cron → README of verified
   sponsored grad roles) — proven to rank; ~1 day of work.
10. **Product Hunt** — credibility/backlink event, not a UK user source;
    sequence after testimonials exist.
11. **Micro-creator affiliates** (30% recurring, commission-only, #ad
    disclosure required) — the "UK visa sponsorship jobs" TikTok niche is
    already commercially validated.
12. **Campus QR-card stunts** — weeks 8–9 amplifier only.
13. **Lifetime-deal marketplaces** — deferred past day 90; hard caps only.
14. **Paid ads — do not run.** Job-keyword CPCs are set by VC-funded bidders;
    Debut spent millions for 18k downloads. Our hours compound elsewhere.

### The week-by-week plan (condensed; full detail in the research archive)

| Week | Focus | Cost | Target outcome |
|---|---|---|---|
| 1 | Dogfood starts (20–25 genuine submissions) + **ship sponsor filter (#27)** + founder posting begins (1 LinkedIn/day, 2–3 TikToks/wk, honest numbers) | £0 | Gate data + first followers + build-in-public trail |
| 2 | **Free Sponsorship Checker** (no signup, shareable result card, deep-links to live jobs) + finish dogfood gate | £0 | The WhatsApp-forwardable top-of-funnel asset |
| 3 | **Programmatic SEO wave 1**: /sponsors/[company] pages ONLY for the ~1–5k sponsors with live jobs (never all 126k — thin-content kills fresh domains), sponsor-diff pages ("newly licensed this week"), GitHub jobs repo, **ICO registration + GDPR checklist** | ~£40–60 (ICO fee) | 2–5k indexed pages compounding; legally clear for users |
| 4 | Email notifications (#21) then **friends cohort (10–20)** from your own course WhatsApp groups + international societies; capture testimonials + screen recordings | £0 | First non-founder users; testimonial bank; organic forwards |
| 5 | Reddit participation begins + **WhatsApp Channel** (auto-generated daily roles) + salary-threshold calculator | £0 | Owned broadcast list; reputation compounding |
| 6 | **University infrastructure**: careers-service listing request (your own uni first), 2–3 society event sponsorships for term (£100–150 each, skills-workshop format — SU rules prohibit recruitment-only), recruit 3–5 ambassadors (UCL/Manchester/Warwick/Cranfield) paid in Pro accounts | £300–500 | Careers-page listings in motion; workshop slots booked |
| 7 | **Data-report PR** (Sponsorship Report 2026) to PIE News/WONKHE + LinkedIn switches to the proven "this week's 15 sponsor-verified grad roles — comment for the list" format | £0 | Press backlinks; 5–20k-view posts in grad-scheme season |
| 8 | **Welcome week**: piggyback society stalls (never buy commercial stalls — wrong audience), postgrad/international orientation events, QR cards | £50–150 | First 100–500 campus signups at near-zero CAC |
| 9 | **Product Hunt launch** + parallel honest "I built this" posts in UK communities | £0 | Credibility badge; crossing 5 weekly-active users unlocks the Stripe gate |
| 10 | **Stripe ships** with the VISION.md pricing + **Founding Member: £79 lifetime, HARD-capped 30 submissions/mo, first 100–200 only** | £0 | First revenue: £500–3,000 realistic against a warm ~1–2k audience |
| 11 | **Affiliate program** (30% recurring 12mo, no follower minimum) → DM 10–20 UK nano-creators already posting sponsorship content, ready-made clip kit | £0–500 | Permanent TikTok search shelf-space |
| 12 | **The experiment story**: "I let an AI apply to 50 sponsor-licensed jobs — I approved every one first. Here's what came back" + competitor comparison pages (LazyApply vs / JobRight vs — honest angle: US bulk tools ignore sponsorship) + SOC-code pages | £0 | The one viral-shot founder story; cheapest high-intent SEO |
| 13 | **Review, kill, double down**: attribute every signup ("where did you hear about us?"), kill dead channels, expand careers-service outreach to 10 more unis | £0 | Evidence-based channel portfolio for days 90–180 |

**Realistic 90-day totals if executed: 1,500–4,000 registered users, 300+
owned subscribers, 5–15 paying, 2+ press mentions, 3–5k indexed pages
compounding.**

### The warnings (tactics that would kill this specific product)

- **Never sell uncapped lifetime automation** — LazyApply's 2.4★ corpse; we
  have real per-submission COGS. Hard monthly caps on any lifetime offer.
- **Never market on volume** ("1,000 jobs while you sleep") — the AIHawk
  backlash was entirely about spam; our positioning IS the review gate.
  Market response quality and the approval step.
- **Zero billing dark patterns** — one "they kept charging me" thread in
  r/ukvisa erases everything. One-click cancel, pre-renewal emails, loudly.
- **No Reddit link-dropping/astroturfing** — those subs ban it, and fake
  accounts in a visa-anxiety community would be reputational death.
- **Disclose every creator deal (#ad)** — undisclosed UGC is illegal in the
  UK (ASA/CMA) and a time-bomb for an honesty-positioned product.
- **Never publish stale/wrong visa data** — a wrong salary threshold can
  damage someone's actual visa application. Date-stamp, cite gov.uk,
  re-verify on every Appendix update. Accuracy is the moat.
- **No acquisition before the D6 gates pass** — broken applications for
  people whose right to remain depends on outcomes is the worst possible
  trust failure. Dogfood first is a hard prerequisite.
- **Don't mass-generate 126k thin pages** — entity dilution tanked Teal's
  core rankings; publish only pages with live differentiated data.
- **Skip cold email and paid freshers stalls** — documented dead channels
  (£250–1,000/stall buys first-year home students, 2–4 years from needing
  sponsorship).
