# Apply4You — Vision, State of Play, and Business Plan

*Written 2026-07-27, at the founder's request: "I know what I am building but I
have not paid enough attention and I am lost now."* This file is the recap, the
vision mapped against reality, and the money plan. The operating strategy
(gates, launch phases, kill conditions) lives in [DECISIONS.md](DECISIONS.md);
deployment mechanics live in [DEPLOYMENT.md](DEPLOYMENT.md). This file is the
one to re-read when you feel lost.

---

## 1. Where we actually are (the honest recap)

**The product works end-to-end and is live.** Not a prototype — the full loop
has run on production:

- **Web app** is live at https://apply4you-web-one.vercel.app (Vercel, free
  tier). Landing page, signup, guided onboarding, job feed, review dashboard —
  all working and tested on production.
- **The pipeline is proven**: a fresh account was created on the live site,
  uploaded a CV, got it AI-parsed into an editable profile in ~15s, set
  criteria, and the system found **100 matched jobs and auto-queued the top 10
  as AI-filled draft applications in about 30 seconds**. Five were
  fully ready; five honestly flagged questions the AI refused to guess
  (that's the no-fabrication rule working, not a bug).
- **~17,700 open jobs** from **294 company boards** (Greenhouse, Lever, Ashby,
  Workable) are in the database, refreshed every 2 hours *when the worker is
  running*, each scored 0–100 against the user's profile by semantic matching.
- **The one thing never done**: clicking "submit" on a real employer's form.
  The entire submit machinery is built and validated against a high-fidelity
  mock (fill fidelity, confirmation detection, captcha refusal — 37/37 test
  assertions), plus a nine-guard safety pack (blocklist, circuit breaker,
  never-auto-fill-demographics, etc.). But no real application has been
  submitted by the machine yet. That's task #15, deliberately gated.

**Current operating mode** (per DECISIONS.md D2): the background worker runs
on your PC when needed, not hosted 24/7 — because a always-on worker was
burning money doing nothing (the $6 Upstash lesson, since fixed by moving
Redis to Railway flat-rate).

**What it costs today: roughly £4–8/month.** Everything else is free tier.

**The three things standing between here and your own job search running
through it:**
1. Upload your résumé to your real account (the test account has one; yours
   doesn't).
2. Pass the submission validation gate — one supervised real submission or a
   throwaway Workable trial board (task #15).
3. Start the 2-week dogfood run (task #39) — your real job hunt, through the
   product, with the manual-bypass rate tracked.

**Recent battle scars worth knowing about** (all fixed, all documented):
matching silently broke for 9 days when the job table outgrew an 8-second
query limit (fixed: >8000ms → <1ms); Supabase's free tier auto-paused the
whole site after 7 idle days (runbook written); the database blew its 500MB
free cap (fixed: 523MB → 346MB by deleting a column nothing read); duplicate
cross-posted jobs were burning feed slots (fixed with dedupe). The lesson
threaded through all of them: free tiers are landmines, and silent failure is
the enemy — which is why the worker now logs every job failure and Sentry is
a pre-submission requirement.

---

## 2. Your vision, item by item — with my response to each

### 2a. "A place to enter all the user details, add CV and any additional info"

**Status: built.** The onboarding wizard does exactly this: upload CV (PDF or
DOCX) → AI parses it into a structured profile (work history, education,
skills, links, work authorization) → you review and edit every field → saved
as the single source of truth every application is filled from.

**My response — one real gap worth adding:** an **"Additional info" free-text
box** on the profile (notice period, salary expectations, visa status detail,
"anything else recruiters should know"). Today the AI can only answer from
structured profile fields; this box would feed the resolver directly and
reduce the "needs your answer" gaps on drafts. Small task, high value.
Second gap, same spirit: **multiple CV versions** (e.g. a data-focused CV and
a frontend-focused CV, auto-picked per job). Competitors charge for this;
it's a natural Pro feature later. Not now — one CV is fine for dogfood.

### 2b. "Select jobs by 5 keywords, each job scored by how much it matches"

**Status: built, but with a smarter engine than literal keywords — and I'd
keep it that way, with one honest UI change.**

What exists: you set **target job titles** (plus locations, salary floor,
seniority, excluded companies/keywords) and every job shows a **0–100 fit
score**. The score comes from *semantic* matching — the AI compares the
meaning of your whole profile against the meaning of the job description, so
"frontend developer" still catches a job titled "React Engineer" that literal
keyword matching would miss. Jobs whose titles match your target titles get a
visible boost on top.

**My response:** your 5-keywords mental model and the semantic engine aren't
in conflict — the titles field *is* your keywords field, it just isn't
presented that way. What I'd change (small, worth doing):
1. Rename/reframe the preferences UI as **"Your 5 keywords"** with chips
   instead of a comma list — same data, matches how you think about it.
2. Add a **"why this score"** line on each job card (e.g. *"Strong skills
   overlap: React, TypeScript · title matches 'Software Engineer' · London"*)
   — the score stops being a mystery number. The matching reasons are already
   generated for the top 40; this extends them.
What I'd *not* do: replace semantic scoring with literal keyword counting —
that's how you end up missing 60% of relevant jobs and matching "Java" when
you typed "JavaScript".

### 2c. "Search similar websites to inspire features"

**Status: research commissioned — six parallel agents are scanning LazyApply,
AIApply, Simplify, Careerflow, JobRight, LoopCV, Teal, Huntr, plus the UK
visa-niche boards and the space's monetization patterns.** Results land in
section 4 below.

### 2d. "Email integration and inbox section"

**Status: not built. My response: right idea, wrong order if done all at once
— split it into three phases, because the phases differ 100x in effort:**

- **Phase 1 — outbound notifications (do at friends launch; already task #21
  and a hard gate requirement in DECISIONS.md D6).** "Your application to X
  was submitted / failed / needs your answer" emails via Resend. A day of
  work, free tier covers 3,000 emails/month. Without this, non-founder users
  have to keep checking the dashboard — a churn machine.
- **Phase 2 — an in-app inbox via a forwarding alias (build during/after
  friends phase).** Each user gets a unique address (e.g.
  `u-7f3a@mail.apply4you.com`) used as the contact email on applications, or
  they forward employer replies to it. Replies appear in an **Inbox tab**
  linked to the application they came from — which also powers response
  tracking (task #29: who replied, interview rates, which score bands convert
  to interviews). Moderate build (~a week), no third-party approval needed.
- **Phase 3 — full Gmail/Outlook OAuth inbox sync (post-revenue only).**
  Reading users' real inboxes to auto-detect employer replies is the dream,
  but Google's security review for Gmail-scope apps (CASA verification) takes
  weeks, can cost real money annually, and is a data-protection liability a
  pre-revenue product shouldn't carry. Every serious competitor gated this
  behind traction too.

### 2e. "Main page: think of many different ideas, then tell me which is better"

Five directions, then my pick:

| # | Concept | The hero moment | Strength | Weakness |
|---|---|---|---|---|
| A | **Current: "The applications write themselves. You just say go."** + animated mock of a form being filled | Watching fields fill themselves, with one honestly flagged as "needs your answer" | Honest, calm, differentiates on trust | Static; asks for belief instead of showing *your* jobs |
| B | **Instant-gratification demo**: upload your CV (or paste your target role) right on the landing page → see 5 real matched jobs with live scores *before* creating an account | "It already found my jobs" | Strongest conversion pattern in SaaS: value before signup. We genuinely have 17k jobs to show, costs pennies per visitor | Needs guest-session plumbing + abuse limits; a day or two of work |
| C | **Numbers wall**: "12,431 applications submitted · 9% interview rate" | Social proof | Very persuasive *once true* | We have no numbers yet; faking them would be trust suicide. Park until dogfood produces real stats |
| D | **Niche-first: "Visa-sponsored jobs. Applied to while you sleep."** — Skilled Worker sponsor-licence checkmarks on every job | The sponsor filter nobody else has | Speaks straight to the wedge audience (DECISIONS.md D5, coverage check passed: 63% of our UK jobs are at licensed sponsors) | Narrows the general audience if it's the *only* front door |
| E | **Film the robot**: a 30s screen recording of a real application being filled and submitted, embedded as the hero | Nothing sells automation like watching it | Visceral proof | Can't exist until task #15 (first real submission) — and then it's cheap to make |

**My recommendation: B as the main page (keep A's copy and trust bullets
under it), D as a separate landing page at `/sponsored` targeting the visa
niche (also the SEO play — "skilled worker sponsor jobs" queries), and E
recorded during your first supervised submission and added to both. C waits
for real numbers.** B wins because it converts a visitor's 10 seconds of
attention into *their own* matched jobs — the one thing no static pitch can
compete with, and something we can actually deliver because the job database
already exists.

### 2f. "Cost breakdown, what to charge, profit margins" → section 5.

### 2g. "What else can make money" → section 6.

---

## 3. The vision, restated in one paragraph

Apply4You is a **review-gated AI job-application agent**: the user tells it
who they are once (CV + details + keywords), it watches ~300+ company job
boards continuously, scores every opening against them, fills the
applications an employer would actually receive — from real profile data
only, never invented — and submits the ones the user approves, up to 50 a
day. The trust stance *is* the product: everything the machine writes is
visible and editable before it's sent, gaps are flagged instead of guessed,
and demographic questions are never touched. First beachhead: UK graduates
and visa-sponsorship seekers, where our Home-Office-register sponsor filter
is a feature nobody mainstream has.

---

## 4. Competitor scan — features to steal, gaps to exploit

*Six research agents swept LazyApply, AIApply, Simplify, Careerflow, JobRight,
LoopCV, Teal, Huntr, the UK visa-niche (Student Circus, GradCracker, UKHired,
UKVisaJobs, SponsorshipJobs.io, VisaPath), and the space's monetization
patterns — sites, pricing pages, Reddit, Trustpilot. 2026-07-27.*

### 4a. What the competition charges

| Product | Real pricing | Notes |
|---|---|---|
| LazyApply | $99 / $149 / $999 **per year, upfront only** | No trial; refund guarantee widely reported unhonored |
| AIApply | ~$29/mo toolkit **+ auto-apply credits on top** (~$39–60/100 apps) | Realistic all-in ~$68–89/mo; prices hidden from public site |
| Simplify | Free autofill/tracker; **Simplify+ $39.99/mo** ($19.99/wk!) | Pricing only shown in-app |
| Careerflow | Premium $23.99/mo; Plus $44.99/mo | Credits expire monthly, no rollover |
| JobRight | Turbo **$39.99/mo** (~$30 effective quarterly) | Checkout countdown timers |
| LoopCV | $19.99/mo (100 apps) → $59.99 (300) → **$89.99 "Done For You"** with weekly calls | ~$39 lifetime deals recur on AppSumo |
| Teal | Teal+ $29/mo, $9/wk, $179/yr | Weekly SKU targets short search cycles |
| Huntr | Pro $40/mo (~$30 quarterly) | Generous free tier |
| UKVisaJobs | **~£17/mo for sponsored-job LISTS alone** | Proves niche willingness-to-pay with zero execution |
| VisaPath | Premium from £9/mo | The niche's tooling-only price floor |
| Student Circus | Free to students; **universities pay the licence** | The B2B2C model working in our exact niche |

Market anchors: human CV rewrites clear at $149–349 one-off; sub-£10 one-off
reports demonstrably sell; university site licences run low-£000s to
low-£0,000s per institution; freemium in this category converts ~2–4%.

### 4b. Features worth stealing (curated from 17 found)

1. **Per-job sponsorship verdict badge** — licence status + salary vs visa
   threshold (£41,700 general / £33,400 new-entrant) + "actively sponsoring"
   signal, with evidence links, *before* a submission is spent. JobRight's
   US-visa (H1B) filter alone drove ~50k organic users — the UK equivalent is
   our wedge, and nobody here executes on it.
2. **"Why you match" + keyword-gap chips** on the approval screen (matched /
   missing / suggested skills). Free users see the score; paid see the full
   breakdown — Huntr proved this exact paywall lever. (Directly implements
   your "5 keywords" vision, §2b.)
3. **The application packet** — per-job tailored CV + cover letter + every
   AI-filled answer presented as *one reviewable artifact* before submit.
   (This is your tailored-CV vision, §5a costs it.)
4. **Free-forever matching/scores/tracker, paywall the submissions** — the
   converged Simplify/Teal/Huntr gate; conveniently, submissions are also our
   actual cost driver.
5. **Published per-ATS success rates as a trust feature** — Simplify's public
   accuracy hierarchy validates our Greenhouse-first order; AIApply's 38%
   custom-question failure rate is the public foil. We already built the
   metrics script (task #25).
6. **Company-level rate limiting surfaced in-product** ("we never spam one
   employer with your name") — the direct answer to LoopCV's horror stories.
7. **Graduate Route countdown planner** — "X months left, Y verified-sponsor
   applications/week needed." Converts the niche's deadline anxiety into an
   engagement loop.
8. **Free lead magnets**: sponsor-licence checker, salary-threshold
   calculator, pre-signup CV score (our existing parse pipeline) — the
   VisaPath/Careerflow funnel playbook, and exactly main-page concept B.
9. **Multiple CV/profile slots** as a paid-tier axis; **named saved-search
   agents** (LoopCV's "loops") as the mental model for matching profiles.
10. **Review-gated recruiter outreach** as a parallel channel later —
    user-approved per email, never LinkedIn scraping.

### 4c. The gaps we exploit (their 1-star reviews are our positioning)

- **Blind wrong-data submission** — LazyApply's entire 1-star pile is "it
  filled the form wrong and submitted anyway." Our review gate is the direct
  counter-position.
- **AI fabrication** — JobRight has 18+ documented reports of invented
  skills; Teal misspelled users' own names. Our no-fabrication rule is a
  *marketable guarantee*, not an internal policy.
- **No audit trail** — JobRight Agent users can't see what was submitted
  where. Our submitted-snapshot archive answers it verbatim.
- **Spray-and-pray, zero interviews** — Simplify users report 100 apps / 0
  interviews. "Fewer, better applications" + per-company limits attacks the
  category's #1 disappointment.
- **Wasted visa applications** — students discover the sponsorship
  auto-reject only after finishing the form. "We never auto-apply to a
  non-verified sponsor" is a promise no list-only competitor can match.
- **Verification without execution** — every UK sponsor product stops at
  filtered lists. Nobody in the niche charges for *execution*. That slot is
  open.
- **Billing dark patterns as the category norm** — hidden pricing, annual
  upfront, charges after cancellation (~72% of JobRight's 1-stars), countdown
  timers, expiring credits, unhonored refunds. Transparent monthly pricing +
  one-click cancel + quota-not-credits is **free differentiation**.
- **GDPR failures with CV data** — Simplify published support conversations
  containing PII. We already built export + hard-delete (Phase 7).

---

## 5. Costs, pricing, and margins (the deep breakdown)

### 5a. The full per-application cost stack

What one application *actually* costs when the machine does everything your
vision describes — finds the job, builds a tailored CV and cover letter, and
applies on the company's own website. AI prices are Gemini's published rates;
token counts are from our live cost logging and real prompt sizes; timing
constants are read from the code, not estimated.

| Step | What happens | Marginal cost |
|---|---|---|
| Job discovery | Job scraped from the company board + embedded **once**, then shared by every user it matches | ~£0.0002 /app |
| Matching | Nightly semantic match + one-line "why" reason (batched, top 40 only) | ~£0.0004 /app |
| Form field resolution | One batched Flash-Lite call answers the entire application form from the profile | ~£0.0004 |
| Cover letter | Flash call, only when the form asks (~40% of Greenhouse forms) | ~£0.0016 when it fires → ~£0.0006 avg |
| **Tailored CV per job** *(your vision — NOT built yet, costed here for when it is)* | Flash rewrites the profile against the specific JD → structured CV → Chromium renders the PDF (~4s compute) | ~£0.004 |
| **Applying on the company's website** | Headless Chromium opens the employer's real form: page load + **10–45s human-pace jitter** + field-by-field fill with human pauses + résumé upload (+2.5–4s ATS parse wait) + submit click + confirmation detection → **~1.5–3 minutes of browser time per application** | compute — see 5b |
| Proof artifacts | Confirmation screenshot + immutable submitted-answers + JD snapshot stored | ~£0.0001 |
| **Marginal AI+storage total** | | **~£0.006 /app with tailored CV (~£0.002 without)** |

The AI is nearly free. The real physical cost is the **browser time** — which
is why the server math below matters more than the token math.

### 5b. The server math — Redis and worker as capacity, not line items

**Redis (Railway): ~£4/mo flat, volume-insensitive.** Queue records are
deleted on completion (we set that deliberately), so its memory footprint
stays tiny no matter how many applications flow through. This line never
scales. Done.

**The worker is the throughput bottleneck, by design.** The pacing constants
in the code (deliberate — they're bot-detection safety, not laziness):

- **1 submission per 3 minutes per ATS platform** (hard rate limit) + 10–45s
  randomized jitter + one browser at a time per ATS.
- 4 ATS platforms × 20/hour = **80/hour theoretical ceiling per worker** —
  realistically **~500–1,000 submissions/day**, because jobs skew Greenhouse.
- Each concurrent browser needs ~300–500MB RAM → 4 concurrent = a **2GB
  instance ≈ £15–25/mo** on Railway. Tailored-CV PDF rendering (+4s/app)
  rides the same instance free.

What that buys, per £15–25/mo worker instance:

| Metric | Value |
|---|---|
| Submissions/day capacity | ~500–1,000 |
| Submissions/month capacity | ~15,000–30,000 |
| Compute cost per submission at 50% utilization | **~£0.002** |
| Active users supported (avg 10–25 apps/day each) | **~40–80 users** |
| Scaling model | +1 identical instance per additional ~50–80 users, linear and predictable |

During dogfood the worker runs attended on your PC: **£0**, and a residential
IP (which is *better* for bot-detection risk than a datacenter IP anyway).

### 5c. Total costs by stage — revised with everything in

| Cost item | Now (dogfood) | Friends beta (5–10 users) | ~100 paying users |
|---|---|---|---|
| Railway Redis | ~£4/mo | ~£4/mo | ~£4/mo |
| Worker compute | £0 (your PC) | £0–20 (attended → small hosted) | ~£20–45 (1–2 × 2GB instances) |
| Supabase | £0 | **£20 (Pro — mandatory: free tier auto-pauses and we've already hit both the pause and the disk cap)** | £20 |
| Vercel | £0 | £0 | £0–16 |
| Resend (email) | £0 | £0 | ~£16 |
| Gemini AI — *with per-job tailored CVs* | pennies | ~£3–6 | ~£60–90 (10k apps × ~£0.006) |
| Domain + misc | ~£1 | ~£1 | ~£3 |
| **Total** | **~£5–10/mo** | **~£30–50/mo** | **~£125–195/mo** |
| **Fully-loaded cost per application** | n/a | ~£0.07 (fixed-dominated) | **~£0.015–0.025** |

### 5d. What to charge — revised after the competitor research

Two findings moved my numbers from the first draft: **UKVisaJobs proves
~£17/mo willingness-to-pay for sponsored-job *lists* alone** (we execute, not
just list — we should not price below the list-sellers), and **job searches
run ~3 months** (Teal exploits this with weekly pricing; the honest version
is a quarterly pass, not an annual plan — dropped my earlier annual idea).

| Plan | Price | Applications /mo | What justifies it |
|---|---|---|---|
| Free | £0 | 10 reviewed submissions | Matching, scores, tracker **free forever** — the paywall is the thing that costs us money (submissions). Paywall placement: show 20 matched jobs with sponsor verdicts + 3 filled ready-to-review applications, *then* charge to submit |
| Starter | **£11.99/mo** | 50 | The actively-looking tier (raised from £9.99 — above VisaPath's £9 tooling floor, below UKVisaJobs' £17 list-only) |
| Pro | **£19.99/mo** | 200 | + sponsor verdicts on every job, full keyword-gap breakdown, multiple CV slots, priority queue |
| Season Pass | **£39 / quarter** | Starter-level for 3 months | Matches the real length of a job search; cash up front |
| Done For You | **£79–99/mo** (later) | 300 + human check-ins | LoopCV proved the anxious-grad segment pays this with near-zero extra engineering |

One-off SKUs (no subscription): £9–15 pack of 10 submissions; £5 sponsor-fit
CV report (the lead-in wedge); £49–99 interview-prep pack triggered at the
moment an application converts to an interview (peak willingness to pay).

**Trust levers as conversion features** (the entire category's 1-star reviews
are billing dark patterns): public pricing page, one-click cancel,
pre-renewal reminder email, quotas not expiring credits, and an in-kind
guarantee ("X interviews in 60 days or 2 free months" — never cash refunds).

### 5e. Margins and break-even (with the full cost stack)

- A **Pro subscriber** (£19.99) who uses all 200 applications — tailored CV
  and cover letter on every one, submitted on company websites — costs
  **£1.20 marginal + ~£2–3 of amortized fixed** → **~75–85% margin at worst,
  ~94% for typical (under-using) subscribers.**
- **Break-even on beta fixed costs (~£40/mo): 3–4 subscribers.**
- At **50 paying** (30 Starter + 15 Pro + 5 quarterly): **~£720/mo revenue vs
  ~£130/mo costs → ~£590/mo profit (~82% net)**, solo, no payroll.
- Sanity check against the market: freemium job tools convert **~2–4%** —
  50 paying implies ~1,500–2,500 free signups. That's the real work: the
  funnel, not the infrastructure.
- The capacity warning, quantified: a Power-style heavy user consumes worker
  *time* (3 min/submission), not meaningful AI money. Plan limits + the
  per-worker capacity table in 5b are the margin protection — one £20
  instance per ~50–80 active users, priced in above.

---

## 6. More ways to make money (brainstorm + research, merged)

Ranked by fit — near-term first. Items marked ⚡ came out of the competitor
research with direct evidence behind them.

1. **The sponsor verdict as THE paid feature (strongest).** Visa-seeking
   students face a hard Graduate Route deadline and no mainstream tool
   filters by live Home Office licence — and ⚡ JobRight's equivalent US
   (H1B) filter alone drove ~50k organic users. Coverage already validated
   (63% of our UK jobs at licensed sponsors). Ship the full verdict badge
   (licence + salary-threshold check + "actively sponsoring" signal), not
   just a filter — evidence shown before a submission is spent.
2. **One-off SKUs for subscription-refusers** ⚡: £9–15 pack of 10 reviewed
   submissions; £5 sponsor-fit CV report as the lead-in (sub-£10 one-offs
   demonstrably sell in this space); £49–99 interview-prep pack generated
   from the job_snapshot, offered *at the moment an application converts to
   an interview* — peak willingness to pay. One-off buyers convert to
   subscribers later.
3. **University B2B2C — "Interstride for the UK"** ⚡: Student Circus already
   proves the model in our exact niche (free to students, universities pay
   the licence; low-£000s–£0,000s per institution). ~680k international
   students in the UK, no execution-capable incumbent. Free pilot at 1–2
   universities for the case study — **your own university first; being a
   current student is an unfair intro advantage**. Build the cohort
   engagement dashboard early — it's what wins renewals.
4. **Launch lifetime deal, once, capped, consumable** ⚡: ~3× monthly price
   (£79–99) for *N reviewed submissions per month for life* — **never
   "unlimited"**, which is what destroyed LazyApply's economics. Trades
   margin for cash + reviews + a user base; cap the seats, never repeat.
5. **Cohort codes instead of give-get referrals** ⚡: job-seeking friends are
   *rivals* for the same roles, so classic referrals misfire in this
   category. Instead: society/bootcamp/careers-service codes granting a free
   month, tracked as acquisition channels. If individual referrals exist at
   all, reward consumable credits.
6. **Affiliate revenue (carefully)** ⚡: a vetted, fee-disclosed,
   OISC-regulated immigration-adviser panel shown when it's genuinely
   relevant (e.g. no sponsor matches found), plus interview-coaching
   placements. Run our own affiliate program on Huntr's template (25–30% of
   first 3 months) aimed at UK student-career creators and society
   treasurers. Never let any of it touch job ranking.
7. **Share-link attribution from day one** ⚡: "look what it applied to for
   me" links are the highest-converting traffic documented in this niche
   (~2× other channels). Cheap to instrument now, impossible to retrofit
   attribution later.
8. **Success data as a feature (never sold):** "roles like this reply to
   profiles like yours 12% of the time" as a Pro perk once response tracking
   (#29) has data. **Selling user data itself is fatal to this brand.**
9. **Recruiter-side reverse marketplace (v2+):** where the industry's real
   money lives, but a different product — parked until the consumer side
   works.

**What I'd refuse to do** — now with market proof: display ads; selling
applicant data; "unlimited" anything (LazyApply's corpse); expiring credits,
hidden pricing, checkout countdown timers, or any of the billing dark
patterns that generate the *majority* of 1-star reviews across every
competitor we scanned. Their dark patterns are our marketing.

---

## 7. The order to do things (so this document ends in action)

1. **Résumé on your real account** (2 minutes, you).
2. **Validation gate #15** — one supervised real submission, screen-recorded
   (which also produces the hero video for main-page concept E).
3. **Dogfood for 2 weeks** (DECISIONS.md D1) — your real search; this
   generates the interview-rate numbers that unlock main-page concept C and
   every marketing claim we're allowed to make.
4. During dogfood, I build: the **"Additional info" box** (2a), the
   **keywords reframe + "why this score"** (2b), **email notifications**
   (2d phase 1), the **landing-page instant-demo** (2e concept B), and the
   **application packet** — per-job tailored CV + cover letter + all answers
   as one reviewable artifact (your vision from §2, costed in §5a, validated
   by the research in §4b).
5. **Friends beta** behind the D6 gates → Stripe → the §5d pricing goes
   live.
6. Sponsor **verdict** ships as the first Pro feature (#27); `/sponsored`
   landing page + the Graduate Route countdown planner with it.
