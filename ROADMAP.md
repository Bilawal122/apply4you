# Apply4You Roadmap

*Written Mon 2026-08-03. This is the execution sequence — it consolidates
[DECISIONS.md](DECISIONS.md) (the gates), [VISION.md](VISION.md) (the product
plan), and [COMPETITORS.md](COMPETITORS.md) (the growth playbook) into one
ordered plan with dates, owners, and exit criteria. When priorities conflict,
DECISIONS.md wins.*

**Owner key:** 🧑 You (needs your hands/accounts/decisions) · 🤖 Me (code,
config, content drafts) · 🤝 Both.

---

## The critical path, in one picture

```
Résumé upload (2 min) ──► First supervised submission ──► DOGFOOD (2 weeks)
                                                              │
              parallel build sprint (me) ◄────────────────────┤
              sponsor filter · checker · notifications        │
              packet · landing · SEO plumbing                 ▼
                                                    Gates pass? (D6)
                                                              │
                              Friends beta (10-20) ◄──────────┘
                                                              │
                     September campus window ◄────────────────┤
                     societies · orientation · PH launch      ▼
                                                    5+ weekly actives?
                                                              │
                                            Stripe + revenue ◄┘
```

Everything downstream is blocked by the first two boxes. They have been
pending since mid-July. **They are this week's job.**

---

## Phase 0 — Unblock (this week: Aug 3–9) ⚠️ overdue

The #15 validation time-box expired on Jul 22 without a decision. Re-armed
now with concrete slots:

| # | Item | Owner | Effort | Done when |
|---|---|---|---|---|
| 0.1 | Upload your résumé to your real account (the live app → Profile) | 🧑 | 2 min | `resume_storage_path` set for your user |
| 0.2 | Start the worker attended on your PC when we work (`pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/index.ts`) | 🧑 | 1 cmd | Boot log shows `[worker] up` |
| 0.3 | **First supervised real submission** (task #15 exit B): pick one genuinely low-stakes Greenhouse job from your own search, review every field together, screen-record, watch it submit, verify the confirmation email | 🤝 | ~1 hr | `status=submitted` + confirmation email + recording saved (that recording = the future hero video) |
| 0.4 | Immediately after: verify the duplicate-refusal guard (re-approve attempt must be refused) | 🤖 | 10 min | Second submit refused in logs |
| 0.5 | **Dogfood officially starts** (task #39, D1): every eligible Greenhouse job in your search goes through the product; bypass rate tracked | 🧑 | ongoing | Day-1 date recorded below |

> **Dogfood start date: __________** (fill in when 0.3 passes — the 2-week
> clock and everything in Phase 1 runs from this date.)

**Fallback** if no low-stakes posting feels right: exit A — a $0 Workable
trial board we own (🤝, ~1 hr setup, same afternoon).

---

## Phase 1 — Dogfood + build sprint (dogfood day 1 → day 14, target Aug 4–18)

**You (daily, ~20–30 min):** queue and review real applications (aim 20–25
genuine submissions over the window — "would I have applied manually?" on
every one); note every bug/friction in a running list; post 1 honest
LinkedIn update/day + 2–3 TikTok screen-demos/week (the build-in-public
trail every later channel links to); log employer responses as they arrive.

**Me (the build sprint, in priority order):**

| # | Build item | Task | Effort | Why now |
|---|---|---|---|---|
| 1.1 | **Sponsor verdict filter** — join the ingested Home Office register to jobs; verdict badge (licensed? route? salary vs £41,700/£33,400 thresholds) on every UK job; feed filter | #27 | 2–3 days | The wedge feature; JobRight's H1B equivalent drove 50k users; everything in Phase 3 markets it |
| 1.2 | **Free Sponsorship Checker** — no-signup page: paste employer → licence verdict + N live sponsored roles, shareable result card, deep-link into the feed | #41 | 1–2 days | Top-of-funnel asset; the WhatsApp-forwardable artifact |
| 1.3 | ✅ **Email notifications** (Resend): submitted / failed, shipped 2026-08-03 — full plan in [EMAIL.md](EMAIL.md); needs 🧑 a Resend account + `RESEND_API_KEY` to actually send | #21 | 1 day | Hard D6 friends-gate requirement |
| 1.4 | **Application packet** — per-job tailored CV (generalize render-resume.ts) + cover letter + all answers as one reviewable artifact; submit attaches the tailored PDF | #40 | 2–3 days | Your vision (§2); dogfood is the perfect test bed |
| 1.5 | ✅ **Product polish pack**: "why this score" label on feed + job-detail cards (now consistent), keyword-chips reframe of all list-style preferences, "Additional info" profile box feeding the resolver — shipped 2026-08-03 | #42 | 1–2 days | Your §2b vision; cuts needs-review gaps |
| 1.6 | Landing page: mock hero **replaced with real live listings** (2026-08-03, admin-client query, real company/title/sponsor-badge data, live open-jobs count). Full **instant-demo** — paste a CV/role and see 5 scored matches before signup (guest session + abuse limits) — is still open; bigger lift, tracked separately below | #42 | 2 days remaining | Main-page decision from VISION §2e concept B |
| 1.7 | GDPR housekeeping: ICO registration (🧑 pays the ~£40–60 fee), deletion-flow retest, Gemini disclosure in privacy page | #24-ext | ½ day + fee | D6 friends-gate requirement |
| 1.8 | Fix bugs from your dogfood friction list | — | continuous | The point of dogfooding |

**Phase 1 exit gates (all from D6, checked at day 14):**
- [ ] ≥90% submission success across ≥20–25 genuine submissions
- [ ] Zero-fabrication audit clean on a 20-app sample
- [ ] Confirmation email received for ≥95% of submissions
- [ ] Notifications live · circuit breaker verified · GDPR checklist done
- [ ] **Kill-condition check:** if success can't reach 90% after fixes →
      pivot to assisted-fill per D6. Decide, don't drift.

---

## Phase 2 — Friends beta (gates pass → target Aug 18 – Sep 7)

| # | Item | Owner | Notes |
|---|---|---|---|
| 2.1 | Recruit 10–20 friends/coursemates from your course WhatsApp groups + your campus's international societies | 🧑 | Visa-dependent invitees are allowed **only because** the sponsor filter (1.1) shipped — D5 rule |
| 2.2 | Watch their first applications; collect 3–5 written testimonials + screen recordings | 🤝 | The Product Hunt + landing-page ammunition |
| 2.3 | Weekly cost + per-ATS success report (scripts exist) | 🤖 | Watch the ~£30–50/mo beta budget |
| 2.4 | Ship: WhatsApp Channel (auto-generated daily sponsor-verified roles), GitHub auto-updating jobs repo, salary-threshold calculator | 🤖 | Channels 7 & 9; ~2 days total |
| 2.5 | Programmatic SEO wave 1: /sponsors/[company] pages for the ~1–5k licensed sponsors **with live jobs only**, sponsor-diff pages ("newly licensed this week") | 🤖 | 2–3 days; compounds silently for months |
| 2.6 | Begin Reddit helpful-participation (r/ukvisa, r/UniUK, r/cscareerquestionsUK, r/UKJobs) — answers from register data, product only when asked | 🧑 | 20 min/day; read each sub's rules first |
| 2.7 | Email your university careers service + international-student office: list the free checker on their resources page | 🧑 | One email; each listing = permanent traffic + .ac.uk backlink |
| 2.8 | Consider Lever/Ashby validation (their own sandbox equivalents) to widen beyond Greenhouse | 🤝 | Only if Greenhouse success ≥90% |

---

## Phase 3 — The September window (Sep 7 – Oct 5) 🎯 *the one hard deadline*

One-year Masters students arrive **this month** needing sponsorship within
~8 months — the highest-intent cohort of the year, and it doesn't repeat
until next September.

| # | Item | Owner | Cost |
|---|---|---|---|
| 3.1 | Society deals at your campus: 2–3 international-heavy societies, £100–150 each for a term — "Find your sponsor" skills workshop format (SU rules prohibit recruitment-only events) | 🧑 | £300–500 |
| 3.2 | Piggyback QR-code signups on society stalls + postgrad/international orientation events (never buy commercial fair stalls) | 🧑 | £50–150 printing |
| 3.3 | Recruit 3–5 ambassadors at UCL / Manchester / Warwick / Cranfield, paid in free Pro accounts | 🧑 | £0 |
| 3.4 | Publish the **UK Graduate Visa Sponsorship Report 2026** from our proprietary data (28% boards licensed, 63% of UK jobs at licensed sponsors, sector/city breakdowns); pitch PIE News, WONKHE, Times Higher | 🤝 (I draft, you sign) | £0 |
| 3.5 | LinkedIn switches to the proven format 3×/week: "This week's 15 UK grad roles at licensed sponsors — comment for the list" | 🧑 (I generate the lists) | £0 |
| 3.6 | **Product Hunt launch** — founder story, review gate as the anti-AI-spam angle, testimonial bank from 2.2; parallel honest posts in UK communities | 🤝 | £0 |
| 3.7 | Hero video (from the 0.3 recording) + real-numbers wall added to the landing page once dogfood stats exist | 🤖 | £0 |

**Phase 3 exit gate:** ≥5 weekly-active external users → unlocks Stripe (D6).

---

## Phase 4 — Revenue (Oct)

| # | Item | Owner | Notes |
|---|---|---|---|
| 4.1 | **Stripe ships** (#23): Free 10 / Starter £11.99 / Pro £19.99 (sponsor verdicts + keyword-gap + CV slots) / £39 quarterly Season Pass | 🤖 + 🧑 (Stripe account) | Public pricing page, one-click cancel, pre-renewal emails — the trust levers ARE the conversion strategy |
| 4.2 | **Founding Member**: £79 lifetime, hard-capped 30 submissions/mo, first 100–200 buyers, own site only | 🤝 | Realistic £500–3,000 against the warm audience |
| 4.3 | Affiliate program: 30% recurring 12 mo, commission-only, #ad required; DM 10–20 UK nano-creators already posting sponsorship content | 🧑 (I draft the kit) | £0–500 |
| 4.4 | The experiment story: "I let an AI apply to 50 sponsor-licensed jobs — I approved every one. Here's what came back" + competitor comparison pages | 🤝 | The one planned viral shot |
| 4.5 | Channel review: attribute every signup, kill dead channels, double down on top 2 | 🤝 | JobRight's discipline |

---

## Phase 5 — Scale (Nov+, only what's earned)

- **Hosted 24/7 worker returns** (re-enable Railway auto-deploy) when
  attended operation becomes the bottleneck — capacity math says one £15–25
  instance per ~50–80 active users.
- **Supabase Pro** (£20/mo) at friends scale — mandatory before growth
  (free tier auto-pauses; already bitten twice).
- **In-app inbox** via per-user forwarding alias → powers response tracking
  (#29) and the interview-rate stats.
- **University B2B2C** ("Interstride for the UK") — only when inbound
  interest exists; the week-6 careers listings + Report are the seeds.
  Your own university is pilot #1.
- **Done For You tier** (£79–99/mo), full-auto opt-in (#22), tier-2 ATSs
  (#31), browser extension / assisted mode (#30 — also the D6 pivot
  destination if headless submission ever hits a wall).

## Explicitly deferred (decided, stop re-deciding)

Full Gmail/Outlook OAuth inbox (post-revenue; CASA review pain) · paid ads
(never at this budget — VC-set CPCs) · lifetime marketplace deals before
day 90 · recruiter-side marketplace (v2) · anything "unlimited" · any
billing dark pattern.

---

## The weekly rhythm (suggested)

- **Mon:** review last week's numbers (signups by channel, submissions,
  success rate, costs) — 15 min with me.
- **Daily during dogfood/beta:** review queue (~20 min) + one content post.
- **Fri:** friction-list triage — I fix the top items over the weekend.

*Update this file as phases complete; it supersedes the scattered next-steps
lists in earlier docs.*
