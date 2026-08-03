<!-- Generated 2026-08-04 from a 5-agent teardown of aiapply.co and usesprout.com plus a full read of our own source. Every claim is tagged with what was actually verified; unverified items are flagged in section 0. Pick items by their ID (A1, C3, F1...). -->

# Apply4You — Decision-Ready Change List

**Scope:** the four teardowns (2× AIApply, 1× Sprout/usesprout.com, 1× internal audit) checked against the working tree at `C:\Users\Bilawal\Desktop\wtf am i even doing\AntiGravity\apply4you` (branch `master`, uncommitted changes included), and constrained by DECISIONS.md D1–D6, DESIGN.md, ROADMAP.md and VISION.md.

**Effort key:** S = under half a day · M = 1–3 days · L = 3+ days.
**Tag key:** `COPY` = they do it, we should · `COUNTER` = they do it badly, we do the opposite and say so · `ORIGINAL` = neither does it.

---

## 0. Read this before the list — three corrections to the inputs

**0.1 The internal audit is partly stale.** It describes the feed as "one ruled register list… hard-slices to 50… `apply_url` and `posted_at` selected but never rendered… no description snippet." The working tree at `C:\Users\Bilawal\Desktop\wtf am i even doing\AntiGravity\apply4you\apps\web\app\(app)\feed\page.tsx` is now a 24-card grid with posted-age, a description excerpt, remote / ATS / account-needed tags, sponsor badge, the "Why" line, per-card Queue, and an honest `showing 24 of N` header. Items in the audit about those specific gaps are already closed; I've dropped them and re-derived the remaining ones from the code.

**0.2 Both competitor teardowns are thin exactly where it matters most, and neither can be used as a design reference for the surfaces we care about.** Stating this rather than padding:
- **AIApply's entire logged-in product is unobserved.** `/jobs` is a sign-in wall; `/product` is JS-rendered and returned nothing. So there is **no verified information about their feed layout, in-product job card, whether a match score exists or how it's formatted, or their approval/review UI** — the four things we'd most want to copy or counter. The only job-card specimen anywhere on their site is one marketing mock on `/auto-apply`.
- **Sprout's app is behind signup too.** Their job-card field list came from two competitor-owned review blogs, `/employers` 404s, several `/features/*` pages 404, and refund/cancellation terms are entirely unverified. Their App Store rating (4.6/69K) contradicts their own site's "4.8/5" claim, so their marketing numbers should not be treated as data.
- **Every BBB / Trustpilot claim in both teardowns is secondhand** (Trustpilot 403'd; bbb.org was never fetched). None of it is publishable until read at source. This directly constrains item F6.

**0.3 DESIGN.md now contradicts the code.** DESIGN.md §"Where it's applied" states the feed is "one ruled register rather than a stack of cards." The shipped feed is a 3-up card grid. A design doc that describes something the code doesn't do stops functioning as a system. Pick one and reconcile (item G7).

---

## A. Job feed & discovery

**A1. Delete the false matching claim, then decide the fate of `locations` / `workModel` / `salaryFloor`.** `ORIGINAL` · S (copy) + M (implementation) · **no conflict — this is a DECISIONS compliance fix**
- **Change:** `apps\web\components\onboarding-matches.tsx:182` tells the user *"We match on your titles, locations, salary floor and skills."* Traced end to end, that is false: `packages\ai\src\embeddings.ts` (`profileEmbeddingText`) uses only titles, seniority, industries, summary, skills and work history; `match_jobs` in `supabase\migrations\0015_job_embeddings_table.sql` filters only on `excluded_companies` / `excluded_keywords`; `apps\worker\src\processors\match.ts` adds only the flat +8 title boost. `locations`, `work_model` and `salary_floor` are written to the DB, loaded into the worker's `Preferences` object, and read by nothing. Fix the sentence today (S). Then either wire `locations` into the embedding text and a post-filter (M), or mark the fields in `apps\web\components\preferences-form.tsx` as not yet used.
- **Why:** the product's entire positioning is that it doesn't claim things it can't back. A fabricated capability claim in our own onboarding is a worse version of AIApply's "80% more likely to get a job faster" — theirs is unsourced, ours is disprovable from our own source tree.
- **Flag:** `salaryFloor` can **never** be implemented as described — `jobs` has no salary column and `NormalizedJob` (`packages\shared\src\schemas\job.ts`) carries no salary field. Either remove the input or relabel it as profile context for the resolver, not a matching input.

**A2. Sort control + freshness filter.** `COPY` · S · no conflict
- **Change:** the feed is `.order("score", desc)` only, with no sort control and no date filter. Add sort (fit / newest) and a "posted within 7/14/30 days" filter. Where `posted_at` is null, fall back to `first_seen_at` — which is stored, is a better freshness signal for boards that leave `posted_at` null, and is currently surfaced nowhere in the app. Label it **"indexed 2d ago"**, never "posted".
- **Why:** freshness is the one axis where a ~300-board index beats an 8M-listing aggregator; VISION already made that trade ("freshness beats volume at n=1"). Both competitors show posting date on cards; neither can show an index date.

**A3. "Not interested" dismiss, feeding back into matching.** `COUNTER` · M · no conflict
- **Change:** add a per-card dismiss that writes to a `job_dismissals` table and is excluded inside `match_jobs` (same `not exists` shape as the existing applications exclusion). Today the only actions are Queue and Details — there is no way to tell the matcher it was wrong.
- **Why:** AIApply's single most-repeated product complaint is that it "picks jobs with really low match percentages" and applies at the wrong seniority "despite correct settings" — because their control model is filter-level only, set once at onboarding. A per-job negative signal is the direct counter, and it's training data nobody in the category collects.

**A4. Fix the remote filter; add a location filter.** `COPY` · M · no conflict
- **Change:** `remote === "1"` is `ilike('%remote%')` on `jobs.location` (feed page line 78). "Hybrid — 2 days remote" passes; "Anywhere" / "Distributed" fails. Replace with a normalized work-model classification computed at ingest, and add a location filter (which `preferences.locations` already implies exists — see A1).
- **Why:** Simplify treats location/work-model as first-class "dealbreakers"; ours is a substring test that silently lies in both directions.

**A5. Surface `source_count` — "also listed on N other boards".** `ORIGINAL` · S · no conflict
- **Change:** `match_jobs` already computes `source_count` per `(company_key, title_key)` to pick a dedupe winner, then discards it. Return it and render it on the card.
- **Why:** nobody else can show this — it's a by-product of our cross-source dedupe (task #28). It's also a quiet quality signal (a role cross-posted to three boards is being actively pushed).

**A6. Pagination past 24, and past the 200-candidate ceiling.** `COPY` · S (load-more) / M (proper paging) · no conflict
- **Change:** the header honestly says `showing 24 of N` — but there is no way to reach item 25, and the underlying query is capped at `.limit(200)` on `job_matches`, itself fed by `MATCH_LIMIT = 100` per user in the worker. So the real ceiling is 100 matches, not 200 or 17k.
- **Why:** a user who filters hard hits an invisible wall. Also worth deciding whether `MATCH_LIMIT` should rise — it's a cost/quality knob nobody has revisited since the feed became browsable.

**A7. Make the sponsor filter a segment, not a checkbox.** `COPY`/`ORIGINAL` · S · no conflict (D5 labelling already correct)
- **Change:** show the count ("412 of your 100 matches are at licensed sponsors" — pick honest phrasing once A6 settles the denominator) and let it be a persistent view, not a checkbox users may never notice.
- **Why:** JobRight's H1B filter alone drove ~50k organic users. This is the wedge; it currently has the same visual weight as "Remote only".

**A8. Dead code: the "account needed" tag can never render.** S · no conflict
- **Change:** `match_jobs` filters `j.requires_login = false`, so no `job_matches` row can carry `requires_login = true` — the `{m.jobs.requires_login && <Tag>account needed</Tag>}` branch in the feed is unreachable. Either remove it, or (better) stop filtering them out in the RPC and show them as manual-apply items with the tag doing real work.

> **🚩 DO NOT: salary or seniority on job cards.** AIApply's one published card shows `£133.8-200.7k` and `Level: Senior`; Sprout's cards reportedly show a salary range. **We cannot match this without inventing data.** `jobs` has no salary and no seniority column (`0001_init.sql` + all later migrations), and adapters return neither. Producing them means LLM-extracting from the JD, which is inferred data that would need a `written by AI` provenance marker and would still be wrong often enough to matter. `0012_sponsor_verdicts.sql` already refused the related move for exactly this reason ("salary thresholds are deliberately absent: our job rows carry no salary data… publishing a wrong visa number is worse than none"). **Corollary: never ship a "meets the £41,700 Skilled Worker threshold" verdict.**

---

## B. Job detail

**B1. Decompose the fit score.** `ORIGINAL` + `COUNTER` · M · no conflict
- **Change:** `ScoreBadge` (`apps\web\components\ui.tsx:113`) is a bare numeral with a `title` tooltip. On `/jobs/[id]`, break it into its actual, honest parts: semantic similarity, and the `+8` title boost with the matched title named. Add a literal-containment list of the user's own profile skills that appear verbatim in the JD — no model call, no inference, and therefore no fabrication risk.
- **Why:** AIApply has **no per-job match score at all** in any public marketing (verified across their homepage, `/auto-apply`, `/llms.txt` and their own `/compare/aiapply-vs-huntr`), and their reviewers complain the hidden one is ignored. Sprout's score is 1–10 and only appears *after* you swipe. A visible, decomposed 0–100 shown *before* you commit is a real gap in the category.
- **Flag:** do **not** render "you match 6/8 requirements". We do not extract requirements; only literal skill-token presence is defensible.

**B2. Render the description as a document, not a dump.** `COPY` · S · no conflict
- **Change:** `job.description` is emitted verbatim in one `whitespace-pre-wrap` div (`jobs\[id]\page.tsx:112-115`). Greenhouse stores full HTML and averages ~8KB. Sanitise/format it, and collapse past ~600 words with a "show full description" toggle. `descriptionExcerpt` already exists in `apps\web\lib\text.ts` for the feed.

**B3. Cross-sell the wedge from the sponsor block.** `ORIGINAL` · S · no conflict
- **Change:** when `sponsor_verdict.licensed`, add "N other live jobs at this employer" (the same `company_key` + `closed_at is null` count `/check` already runs) and a link to `/check?q={company}`.
- **Why:** the free checker (task #41) is our top-of-funnel artifact; today nothing inside the app points at it, and the two surfaces share a join key.

**B4. Similar roles.** `COPY` · S–M · no conflict
- **Change:** "other openings at {company}" and "same role elsewhere" using the existing `company_key` / `title_key` columns, which the web app uses nowhere except `/check`.

---

## C. Apply / review flow — **highest-leverage group; this is the product**

**C1. Kill the Save-then-Approve dance.** `COUNTER` · S · **no conflict — the gate stays server-side**
- **Change:** `apps\web\components\application-review.tsx:323` disables Approve whenever `app.status === "needs_review"`, and status is only recomputed inside `saveApplicationFields` (`applications\actions.ts:46-49`). So a user who types the missing required answer must click **Save edits**, wait for the round-trip, then click **Approve**. Compute gap-state client-side from `values` and enable Approve as soon as no required field is empty — `approve()` already saves first when dirty, and `approveOne` independently refuses non-`draft` rows server-side, so the gate is untouched.
- **Why:** this friction lands precisely on the applications that need the most human work — the ones our whole positioning is built around. It is the single worst interaction in the product.

**C2. Instrument review quality — time-in-review and edit-rate.** `ORIGINAL` · M · **required by DECISIONS.md D6 and currently unmet**
- **Change:** record card-expand time, time-to-approve, and whether the cover letter / any AI-written field was edited before approval. Nothing captures any of this today.
- **Why:** D6 names "median time-in-review and edit-rate on AI free text" as tracked metrics and states **"<10s median review is a red flag equal to a failed submission."** Without this instrumentation the D6 friends-gate cannot be evaluated at all. This is a gate blocker, not a feature.

**C3. "Approve all drafts" is in tension with D6 — constrain it.** · S–M · **conflict: yes, flagging explicitly**
- **Change:** `ApproveAllButton` → `approveAllDrafts()` approves every draft without requiring a single card to be opened. That drives median review time toward zero, which is the exact red flag D6 defines. Options: require each draft to have been expanded once; or relabel to "Approve the N you've reviewed" with the un-opened count shown; or gate it behind a one-time confirmation that names the count.
- **Why:** the review gate is the product. A button that makes it optional in practice reintroduces AIApply's model ("review… if you prefer more control") through the back door. The sharpest user quote in the whole corpus — *"My first 10 applications went to jobs in languages I don't speak… No refund."* — is the argument for the gate being real, not nominal.

**C4. Per-company rate limiting, enforced and surfaced.** `COUNTER` · M · no conflict (extends D3.9 pacing)
- **Change:** `checkLimits` (`applications\actions.ts:66-107`) enforces a daily cap and a plan cap only. There is no per-company limit anywhere. Add one (e.g. max N applications per `company_key` per 30 days), refuse over it, and show it in the review card: "2nd application to Monzo this month."
- **Why:** VISION §4b item 6 already promises this ("we never spam one employer with your name") and it is the direct answer to LoopCV's documented horror story of one person's name across dozens of roles at a single company. Right now we would make the claim without the mechanism. D3.9's pacing is per-ATS, not per-company — that is not the same guard.

**C5. Render the full packet on `/applications/[id]` — this is the audit-trail claim's evidence.** `COUNTER` · S–M · no conflict
- **Change:** `apps\web\app\(app)\applications\[id]\page.tsx` shows submitted fields, cover letter and event history — but **not** the tailored CV that was sent, **not** `job_snapshot` (the immutable submit-time JD copy from `0009_retention.sql`, read nowhere in the web app), and not the job link outside the failure block.
- **Why:** VISION states "JobRight Agent users can't see what was submitted where. Our submitted-snapshot archive answers it verbatim," and both AIApply teardowns independently confirm the same hole there ("no mention of application status confirmation, proof-of-submission visibility"). The claim is currently ~70% delivered. This page is also the screenshot for the landing page and the comparison pages.

**C6. Make Skip reversible.** `COUNTER` · S · no conflict
- **Change:** `skipApplication` is terminal (`draft|needs_review → skipped`) with no inverse action, and `match_jobs` excludes any job with an application row — so one misclick removes a job from the user's world permanently.
- **Why:** irreversibility is a trust cost, and AIApply's reviewers already report things "just vanishing" from their account. Cheap to fix, easy to say.

**C7. Give ordinary fields real provenance instead of an inferred one.** `ORIGINAL` · M · no conflict
- **Change:** `sourceOf` in `application-review.tsx:136-141` is `edited-this-session → you`, `non-empty → profile`, `empty → unknown`. After a page reload, every AI-chosen answer reads **"from your profile"**. DESIGN.md documents this as deliberate ("the resolver doesn't record which path filled each one"). Make the resolver record it and store it alongside `resolved_fields`.
- **Why:** provenance is the signature of the design system and the trust argument made visible — and it is currently only three-quarters honest on the one screen where it matters. Do this by *recording*, never by inferring.

> **🚩 DO NOT: a Sprout-style "Require Approval" toggle.** Sprout exposes the review gate as a user setting, implying full-auto is the default. DECISIONS.md **D3 is explicit**: "Full-auto mode stays off for everyone, founder included; any future auto-submit requires an explicit per-user opt-in," and D4 defers it. Task #22 sits in ROADMAP Phase 5. Shipping an approval toggle now directly breaks D3. Note also that Sprout, our closest structural analogue, does **not** gate the review setting behind a tier — if/when #22 lands, gating it as a Pro feature would look like selling the removal of a safety control.

> **🚩 DO NOT: prefill demographic/EEO fields under any framing.** D3.5, forever, any ATS, any user. Current code correctly hides `eeo[...]` and `resume_text` from review entirely.

---

## D. Onboarding

**D1. Manual-entry escape hatch when the parse fails.** `ORIGINAL` · S · no conflict
- **Change:** `apps\web\app\(app)\onboarding\page.tsx:69-73` catches a parse failure by setting an error string and returning the user to the same upload box. There is no "enter my details by hand" path. Render `ProfileForm` seeded with `EMPTY_PROFILE` instead.
- **Why:** a single bad PDF currently dead-ends the entire funnel at step 1. AIApply and Sprout are both clocked at "under 10 minutes" end-to-end; our failure mode is infinite.

**D2. State the limit before setup, not after.** `COUNTER` · S · no conflict
- **Change:** put "Free — 10 reviewed submissions per 30 days, then £X" on the upload step and on the matches step, not only in the landing CTA.
- **Why:** the teardown names AIApply's **defining UX moment** as discovering the separately-priced credit wall *after* completing setup. Their onboarding is fast and their wall is late. Ours should be equally fast with the wall stated first — the cheapest trust win in the whole document.

**D3. Show the auto-queued 10 before queuing them.** `COUNTER` · S–M · no conflict (strengthens D1's copy rule)
- **Change:** `onboarding-matches.tsx:62-68` fires `queueTopMatches(10)` with no confirmation and no preview. Show the 10 titles + companies + scores with a "Queue these 10" button and per-row deselect.
- **Why:** D1's copy rule is "drafts prepared for your review — nothing is sent without you." The current flow chooses ten jobs *for* the user before they've seen one. Sprout's whole UX thesis is per-job intent (swipe); AIApply's is filter-level intent, and that's the model whose failure mode is documented. We're currently closer to AIApply here than our own decision log allows.

**D4. Wizard back-navigation.** `COPY` · S · no conflict
- **Change:** `apps\web\components\onboarding-steps.tsx` renders `<span>`s — there is no way back to a previous step.

**D5. Consider derived-default preferences to shorten step 3.** `COPY` · M · no conflict
- **Change:** pre-fill target titles from the parsed CV's most recent job titles so preferences can be a confirm-not-compose step.

---

## E. Dashboard

**E1. Fix the "Jobs matched" tile — it disagrees with the feed.** · S · **truthfulness fix**
- **Change:** `dashboard\page.tsx:74` counts every `job_matches` row including jobs already applied to; the feed's `available` count excludes them. Two numbers, same label, different pages.

**E2. Per-card Queue on the recommended grid.** `COPY` · S · no conflict
- **Change:** the dashboard cards' only per-job action is "Details" — the feed's identical-looking cards have a Queue button. The only in-place dashboard action is the all-or-nothing Auto Apply.

**E3. A visible pause / kill switch.** `COPY` + `ORIGINAL` · M · no conflict
- **Change:** AIApply's auto-apply dashboard reduces to two numbers (`142 Applications Submitted` / `387 Job Matches Found`) plus **pause/stop controls for the running agent**. We have six tiles and no stop button. Add a per-user "pause everything" that blocks approvals/submissions and shows as an explicit state.
- **Why:** the pause button is the cheapest possible proof that the machine is controllable, and D3's whole architecture is about controllability. Also useful during dogfood.

**E4. Surface `ats_health` when the circuit breaker trips.** `COUNTER` · M · no conflict
- **Change:** `ats_health` (`0008_safety_pack.sql`) tracks `consecutive_failures` / `paused` / `last_failure_reason` and is service-role only, referenced nowhere in `apps\web`. A user whose submissions are paused by a tripped breaker gets **no explanation at all**.
- **Why:** VISION's own lesson from four production incidents is "silent failure is the enemy." We built the safety mechanism and then hid it. Showing "Greenhouse submissions paused — 3 consecutive failures, re-arming manually" is both honest and a differentiator (no competitor admits an ATS is down).

**E5. Per-ATS success rate, in-app first.** `COPY`/`COUNTER` · M · no conflict
- **Change:** the metrics script exists (task #25). Show success rate per ATS on the dashboard once n is meaningful; publish it later (G3).
- **Why:** Simplify publishes an accuracy hierarchy (Greenhouse ~90% > Lever ~85% > Ashby ~80% …); AIApply's documented 38% custom-question failure rate is the foil. **Do not publish until real n exists.**

> **🚩 DO NOT: an interview-rate or response-rate tile.** Structurally impossible today — the `applications.status` vocabulary (`0008_safety_pack.sql`) ends at `submitted / failed / skipped / needs_manual_verification`. There is no post-submission outcome state, so replies, interviews and rejections **cannot be recorded**. Any such number would have to be invented. This is task #29 and it needs schema work first. VISION already parks landing-concept C for the same reason.

---

## F. Landing / conversion

**F1. Ship the instant demo (task #43 / ROADMAP 1.6).** `COPY` + `COUNTER` · L · no conflict
- **Change:** paste a target role (or upload a CV) on the landing page → 5 real scored matches with sponsor badges, before signup. Guest session, hard abuse limits, guest CV discarded at session end.
- **Why:** this is the **strongest single signal in the entire competitor corpus**, and it points both ways. AIApply's `/ai-resume-scanner` is genuinely ungated — no signup, no email — and their funnel is *upload → score → keyword gaps → upsell the fix*. Simultaneously, their `/jobs` is a hard auth wall, meaning **their job inventory generates zero pre-signup surface and zero SEO** — a structural concession they cannot reverse without redesigning their product. We have ~17k real jobs and a scoring pipeline that costs pennies per visitor. This is the highest-leverage item on the page.
- **Flag:** do not persist guest CVs beyond the session (D6 GDPR readiness).

**F2. Make the register extract clickable.** `COUNTER` · S–M · no conflict
- **Change:** the seven real openings on `apps\web\app\page.tsx:183-204` are inert `<li>` rows. The one piece of real inventory on the page does nothing. Link each to a public read-only job page (admin-client-backed, same pattern `/check` already uses to work around authenticated-only RLS), or at minimum to `/check?q={company}` for licensed sponsors.
- **Why:** every such page is indexable inventory that AIApply structurally cannot produce.

**F3. Publish a real pricing page — now, before Stripe.** `COUNTER` · S · **no conflict with D6, but needs a founder decision**
- **Change:** a `/pricing` route listing Free 10 / Starter £11.99 / Pro £19.99 / Season Pass £39 (VISION §5d), with "billing isn't live yet — the beta is free" stated plainly, plus one-click-cancel and no-expiring-credits commitments.
- **Why:** AIApply's `/pricing` renders **no plan names, no prices, no billing periods** — confirmed by two independent fetches — and the only place they publish numbers is on `/compare/*` pages where prices help them win an argument. It is their most-cited trust failure and the entire category's #1 source of 1-star reviews. A page with numbers on it costs us nothing and needs no Stripe.
- **Flag:** D6 gates *building Stripe* at ≥5 weekly actives; it does not gate publishing prices. The real cost is committing publicly to numbers before validating them — that's your call, not a constraint.

**F4. The live-application ticker — honest version, gated on real data.** `COPY` · M · **conflict: would require fabrication if built now**
- **Change:** AIApply's homepage runs a rolling recent-applications feed with company logos and relative timestamps ("Senior Backend Engineer, Stripe, 2 min ago") plus "372,241+ roles applied to". The teardown calls it the most copyable element on their site, and ours could be strictly more credible — real anonymised rows from our own DB, each carrying a sponsor verdict theirs cannot.
- **🚩 Flag:** **we have zero real submissions today** (task #15 is still `in_progress`). Building this before dogfood produces rows means inventing them. Queue it behind ROADMAP Phase 1, alongside the numbers wall and the hero video from the 0.3 recording.

**F5. `/sponsored` landing page + `/sponsors/[company]` programmatic pages.** `ORIGINAL` · M–L · no conflict (ROADMAP 2.5)
- **Change:** we have ~126k register orgs (`sponsors` table) joined to jobs on `company_key`. Generate pages only for sponsors with live jobs, as ROADMAP already specifies.
- **Why:** AIApply's entire indexable estate is `/salaries`, `/careers`, `/skills`, `/resume-examples` and seven `/compare/*` pages — generic content anyone can write. A per-employer sponsor-licence page backed by government data plus live inventory is a surface **no competitor in any of the four camps can build**.

**F6. Comparison pages — with a hard sourcing rule.** `COPY` · M per page · no conflict
- **Change:** both AIApply (7 pages) and Sprout (`/vs/jobright`) run them; it's table stakes. Build `/vs/aiapply` first.
- **Usable, first-party, checkable facts:** their `/pricing` publishes no prices (verifiable by anyone in 5 seconds); their Chrome extension is listed on **their own comparison page** as "Extension removed from store (Oct 2025)"; their own site shows **three different user counts** (2,064,348 in the hero, 1,166,440+ in the FAQ, 1,005,991+ on `/jobs`); AIApply Ltd is a **UK company** (No. 15200716, Leicester), so UK GDPR applies to them exactly as to us.
- **🚩 Flag:** do **not** publish the Trustpilot integrity notice, the BBB "F" rating, the complaint quotes, or the "38% custom-question failure rate" without reading the primary sources yourself. Both teardowns flag all of these as secondhand (Trustpilot returned 403; bbb.org was never fetched; most corroborating blogs are competitors selling rival tools). A page whose thesis is "they make claims they can't back" cannot itself carry unverified claims.

**F7. FAQ + one real screenshot.** `COPY` · S–M · no conflict
- **Change:** no FAQ, no screenshots, no walkthrough today. The asset to lead with is the review screen with a `NeedsYouStamp` visible on an unanswered required field — literally the screen no competitor will ever show.

**F8. Student funnel: `.ac.uk` verification → discount code.** `COPY` · M · no conflict (needs F3 first)
- **Change:** AIApply's `/students` is 40% off via student-email verification, with **no student-only features** — a pure price gate that harvests `.edu`/`.ac.uk` addresses. Cheap, proven, and precisely aligned with ROADMAP Phase 3's September Masters window.

---

## G. Trust & differentiation

**G1. Publish the no-fabrication guarantee as a page, and make each clause testable.** `ORIGINAL` · S · no conflict
- **Change:** one page stating: demographic/EEO questions are never auto-filled (D3.5); no answer is invented — gaps are stamped and left for you; every value declares its provenance; nothing is submitted without your approval; here is the exact packet an employer receives (link to a real C5 permalink).
- **Why:** VISION §4c is right that "our no-fabrication rule is a *marketable guarantee*, not an internal policy" — but it currently exists only in code comments and a decision log. JobRight has 18+ documented fabrication reports; Teal misspelled users' own names. This is the claim, written down.

**G2. Resolve the quota-vs-credits inconsistency before it's a support ticket.** · S (decide + state) / M (implement rollover) · **conflict: our positioning currently overstates our implementation**
- **Change:** VISION §5d lists "quotas not expiring credits" as a trust lever. In practice `currentUsagePeriod` is a rolling 30-day window and usage counts submissions since `start` — so **unused submissions silently do not roll over**. That is a quota reset, which is defensible, but it is not meaningfully different from what we criticise Careerflow/Huntr for. Meanwhile AIApply's strongest trust move is "credits never expire."
- **Decision needed:** either state the reset plainly on the pricing page and in the dashboard tile, or implement a capped rollover. Do not leave it implicit.

**G3. Publish per-ATS success rates once n is real.** `COPY`/`COUNTER` · M · no conflict (see E5)

**G4. Make the privacy claim more specific than theirs, and true.** `COUNTER` · S · no conflict (D6 requires the underlying work anyway)
- **Change:** AIApply attacks LazyApply with "EU GDPR, data deleted within 24 hours, no third-party data sales" — a checkable promise that is almost certainly false for a company that retains application records. Publish our actual per-data-class retention: profile and applications retained while the account lives; job snapshots kept indefinitely by design (D4, with the reason given); unapplied closed jobs purged at 30 days (task #37); one-click export and hard delete including vectors (task #8); explicit Gemini-processing disclosure; ICO registration number when it lands.

**G5. Refuse the interview-overlay category, in writing.** `COUNTER` · 0 effort, decision only
- **Change:** add a line to DECISIONS.md: we will not build a live interview-assistance overlay.
- **Why:** AIApply's "Interview Buddy" ($19/mo separate) is explicitly sold on undetectability — *"works discreetly in the background, so only you can see the prompts"* — and records interview transcripts. It is their 2× price anchor and their largest ethical liability. An honesty-positioned product should name the line it won't cross *before* the revenue pressure arrives, not after.

**G6. Sprout's proxy inbox is the one real capability gap — and it's already our roadmap.** · L · no conflict
- **Note, not a new item:** Sprout's genuine differentiator is a private forwarding inbox that intercepts recruiter mail, forwards it, routes replies back, and drives an automatic per-application timeline. That is VISION §2d Phase 2 and ROADMAP Phase 5 ("in-app inbox via per-user forwarding alias → powers response tracking #29"). It is also the unlock for every outcome metric in E5/G3. Correctly sequenced; flagging only so it isn't mistaken for something we've already answered.
- **Also out of scope, deliberately:** Sprout's swipe UX and native iOS/Android apps. Not a fit for a review-gated packet whose whole point is reading before approving.

**G7. Reconcile DESIGN.md with the shipped feed.** · S · no conflict
- **Change:** DESIGN.md says the feed is "one ruled register rather than a stack of cards"; the code is a card grid. Also: the `FieldRow` atom exported from `ui.tsx:169` has **no importers** — the ruled-row pattern is re-implemented inline in both `application-review.tsx` and `app\page.tsx`. And `apps\web\components\danger-zone.tsx` uses raw `red-*` / `neutral-*` Tailwind utilities instead of the `danger` / `line` tokens.

---

## H. Pricing & packaging

**H1. Publish prices now.** — see **F3**. Highest-value item in this group, and the cheapest.

**H2. Do not gate the sponsor verdict behind Pro.** `COUNTER` · 0 effort, decision only · **conflict: contradicts VISION §5d as written**
- **Change:** VISION §5d puts "sponsor verdicts on every job" and "full keyword-gap breakdown" behind Pro (£19.99). That contradicts (a) the free public checker at `/check` which already gives the verdict away to anonymous strangers, and (b) our own honesty positioning — the sponsor verdict is a *safety* signal for visa-dependent users, and charging for "we'll tell you before you waste an application on an employer who can't sponsor you" reads badly for exactly the cohort we're targeting in September.
- **Recommendation:** verdicts free everywhere; gate **volume**, multiple CV slots, and priority queue. Note that Sprout — the closest structural analogue — sells volume only and markets it as "All features included in every plan… no upsells or paywalls," which is a clean `COUNTER` to AIApply's four stacked subscriptions (Premium + Interview Buddy + Auto Apply + Auto Customize) and reads far better than tiered feature tables.

**H3. Consider cost-weighted submission units.** `COPY` · S (design) / M (implement) · no conflict
- **Change:** Sprout charges **1–3 credits per submission depending on portal complexity**. Our real COGS is browser time (~1.5–3 min/application, VISION §5b) and it genuinely varies by ATS.
- **Trade-off to weigh:** it aligns price with cost, but it reintroduces credit-arithmetic that VISION explicitly wants to avoid. Recommendation: keep flat units for now; revisit only when tier-2 ATSs (task #31, e.g. Workday) land, since that's when the cost variance becomes real.

**H4. Free tier: our shape is already stronger than theirs — confirm it and stop revisiting.** · 0 effort
- AIApply's free tier is unlimited cover letters + resume scanner + full job board (i.e. everything that costs them nothing). Ours is free-forever matching/scores/tracker with the paywall on submissions — the thing that actually costs us money. Same strategic logic, better fit to our cost stack. VISION §4b item 4 already settled this.

**H5. Affiliate terms are below market — revisit before launch.** · 0 effort, decision only
- ROADMAP 4.3 specifies 30% recurring for 12 months. AIApply's `/affiliates` offers **30% recurring forever**, $50 minimum payout, monthly PayPal/bank, explicitly no follower minimum, no earnings cap, plus a promo kit. Our terms will be compared directly. (Their cookie window is not published — one fewer thing we have to match.)

**H6. Show the plan limit at the moment it bites.** `COPY` · S · no conflict
- **Change:** the dashboard and feed both show `used / limit` with `resets {date}` — good. Add it to the review card's Approve button when `planRemaining` is low, so the wall is visible one action before it's hit rather than at the click.

---

## Suggested order of execution

1. **A1** (false matching claim) · **C1** (Save/Approve dance) · **D1** (parse-failure escape hatch) · **E1** (tile disagreement) — all S, all either truthfulness defects or funnel dead-ends.
2. **C2** (review-quality instrumentation) — D6 gate blocker; nothing downstream can be evaluated without it.
3. **C5** (full packet permalink) + **C4** (per-company limit) + **C3** (constrain Approve-all) — makes the two headline claims (audit trail, no employer spam) actually true, and keeps the gate real during dogfood.
4. **F3** (pricing page) + **D2** (limit before setup) + **G1** (no-fabrication page) — cheapest trust differentiation available, zero engineering risk.
5. **F1** (instant demo, task #43) — the conversion bet, and the one place where a competitor's structural weakness and our structural strength line up exactly.
6. **B1** (score decomposition) · **A2/A3/A4** (sort, dismiss, location) · **E3/E4** (pause + circuit-breaker visibility).
7. Post-dogfood, data-gated: **F4** (real ticker) · **E5/G3** (per-ATS rates) · **F5/F6** (SEO + comparison pages) · **F8/H5** (September student funnel).
