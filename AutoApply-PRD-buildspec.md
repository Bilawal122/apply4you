# Auto-Apply — Product Requirements Document (Build Spec)

A specification of the product to be built. Requirements tagged `[Core]` define the initial product surface; `[Ext]` define later capability.

---

## 1. Product

An AI job-application product for individual job seekers. It sources job postings from the major job boards and applies to them on each company's own ATS (applicant tracking system) page. It operates in two modes: **Assisted** (the AI fills every field and drafts every answer, the user reviews and submits) and **Auto** (the AI fills and submits with no per-application user action). It is a web application plus a browser extension, backed by an API, a sourcing pipeline, an AI layer, and a worker fleet.

The product does not submit applications on LinkedIn or Indeed. Those platforms are read as job sources only. The product does not store LinkedIn or Indeed credentials.

## 2. Users

- New graduates and students: high application volume, low budget.
- Recently laid-off professionals: urgent, high volume, higher budget.
- Visa and sponsorship seekers: apply against a filtered set of sponsoring companies.
- Career switchers and high-volume applicants: value time saved per application.

The product is open to all job seekers. It is English-language, priced in USD, and targets the United States market as its primary market, with English-speaking secondary markets (UK, Canada, Australia) served without localization.

## 3. System components

| Component | Responsibility |
|---|---|
| Web app | Onboarding, profile, job feed, review UI, dashboard, billing |
| Browser extension | ATS detection and form fill in the user's own browser (Assisted mode) |
| API | Profile, jobs, matching, AI answers, applications, billing |
| Sourcing pipeline | Ingests, normalizes, de-dupes, and tags job postings |
| Matching engine | Scores job-to-profile fit |
| AI application layer | Reads forms, resolves field values, generates free-text answers and cover letters |
| Auto-apply worker fleet | Headless submission on no-login ATS forms (Auto mode) |
| Billing | Plans, usage metering, payment |
| Data store | Users, profiles, jobs, applications, subscriptions |

## 4. Data model

Core entities and their shape.

```ts
User {
  id: string
  email: string
  plan: 'free' | 'starter' | 'pro' | 'power'
  createdAt: timestamp
}

Profile {
  userId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  location: string
  links: { linkedin?: string; github?: string; portfolio?: string }
  workAuthorization: string
  workHistory: Array<{ company: string; title: string; start: date; end: date | 'present'; bullets: string[] }>
  education: Array<{ school: string; degree: string; field: string; start: date; end: date }>
  skills: string[]
  resumeFileUrl: string
  summary: string            // derived once, reused across applications
}

Preferences {
  userId: string
  titles: string[]
  locations: string[]
  workModel: ('remote' | 'hybrid' | 'onsite')[]
  salaryFloor: number
  seniority: string[]
  industries: string[]
  excludedCompanies: string[]
  excludedKeywords: string[]
  dailyCap: number
}

Job {
  id: string
  title: string
  company: string
  location: string
  description: string
  atsType: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'other'
  applyUrl: string
  requiresLogin: boolean
  source: string
  postedAt: timestamp
  embedding: vector
}

Application {
  id: string
  userId: string
  jobId: string
  mode: 'assisted' | 'auto'
  status: 'draft' | 'submitted' | 'skipped' | 'needs_review' | 'failed'
  submittedFields: Record<string, string>
  coverLetter: string
  unresolvedFields: string[]
  createdAt: timestamp
}

Subscription {
  userId: string
  plan: string
  applicationsUsed: number
  applicationsLimit: number
  periodStart: timestamp
  periodEnd: timestamp
}
```

## 5. Functional specification

### 5.1 Onboarding and profile
- FR-1 `[Core]` The product parses an uploaded resume (PDF or DOCX) into the `Profile` schema.
- FR-2 `[Core]` The `Profile` is editable and is the single source of truth for all field values.
- FR-3 `[Core]` The product stores `Preferences` covering target titles, locations, work model, salary floor, seniority, industries, excluded companies, excluded keywords, and a daily cap.
- FR-4 `[Core]` The product derives a reusable `Profile.summary` once per profile and reuses it across applications.

### 5.2 Job sourcing
- FR-5 `[Core]` The sourcing pipeline ingests postings from ATS public job-board endpoints (Greenhouse, Lever, Ashby, Workable) and from a job-aggregator API, normalized to the `Job` schema.
- FR-6 `[Core]` Each `Job` record carries its detected `atsType`, its `applyUrl`, and its `requiresLogin` flag.
- FR-7 `[Ext]` The pipeline de-duplicates postings that appear across multiple sources.
- FR-8 `[Ext]` The pipeline supports a sponsoring-company filter.

### 5.3 Matching
- FR-9 `[Core]` The matching engine embeds the profile and each job description and produces a 0 to 100 fit score.
- FR-10 `[Core]` The job feed presents matched jobs ranked by fit score with a one-line reason per job.

### 5.4 AI application layer

Field reading:
- FR-11 `[Core]` The layer reads a target ATS form into a field schema:
```ts
Field {
  id: string
  label: string
  type: 'text' | 'select' | 'radio' | 'textarea' | 'file'
  options?: string[]
  required: boolean
  maxLength?: number
}
```

Field resolution:
- FR-12 `[Core]` Fields whose labels map to known profile attributes (name, email, phone, location, links, work authorization, resume upload) are resolved deterministically from the `Profile`, without an LLM call.
- FR-13 `[Core]` Remaining fields are resolved by a single batched LLM call per application that returns a value or `null` per field.
- FR-14 `[Core]` The resolution call is constrained to: use only facts present in the `Profile`; for `select` fields return exactly one value from the provided `options`; respect each field's `maxLength`; return `null` for any required field whose value is not present in the `Profile`.
- FR-15 `[Core]` No-fabrication guardrail: the layer never returns invented experience, numbers, or credentials. Absent data resolves to `null`.
- FR-16 `[Core]` `null` results are recorded on the `Application` as `unresolvedFields`.

Free-text generation:
- FR-17 `[Core]` The layer generates cover letters and free-text answers from the `Profile`, the specific `Job` (title, company, description), and the exact prompt of the field being answered.
- FR-18 `[Core]` Generated text is grounded in profile facts, matches job-description requirements and keywords, respects the field `maxLength`, and excludes filler phrasing including "passionate about" and "leverage".

Model routing:
- FR-19 `[Core]` Batched field answers and short free-text responses are generated by a low-cost model (Gemini 2.5 Flash / Flash-Lite).
- FR-20 `[Core]` Cover letters are generated by a higher-quality model (Claude Sonnet), which also serves as fallback for low-confidence Flash output.

Cost controls:
- FR-21 `[Core]` The constant profile portion of prompts is cached across a batch.
- FR-22 `[Ext]` Answers to recurring generic questions are cached per user and re-tailored rather than regenerated.

### 5.5 Submission — Assisted mode
- FR-23 `[Core]` The browser extension detects the ATS by URL pattern (`boards.greenhouse.io`, `jobs.lever.co`, `*.ashbyhq.com`, Workable domains).
- FR-24 `[Core]` The extension fills each field from the resolved values and uploads the resume file.
- FR-25 `[Core]` After setting a value on a controlled input, the extension dispatches `input` and `change` events so the form registers the value.
- FR-26 `[Core]` For custom dropdowns and comboboxes, the extension focuses the control, types, and selects the rendered option.
- FR-27 `[Core]` The review UI presents every filled field and every generated answer for inline edit before submission, and surfaces `unresolvedFields` as fields the user must complete.
- FR-28 `[Core]` The user submits; the resulting `Application` is recorded with status `submitted`.
- FR-29 `[Core]` Per-ATS field adapters define the field-to-value mapping for each supported ATS.

### 5.6 Submission — Auto mode
- FR-30 `[Core]` Auto mode targets `Job` records where `requiresLogin` is `false` (public Greenhouse, Lever, Ashby, Workable forms).
- FR-31 `[Core]` Headless workers open the `applyUrl`, fill fields from resolved values, upload the resume, and submit, driven by a queue.
- FR-32 `[Core]` Each submission is bounded by the user's `dailyCap` and by per-endpoint rate limits.
- FR-33 `[Core]` Each submission is recorded on the `Application` with a snapshot of `submittedFields` and `coverLetter`.
- FR-34 `[Core]` A submission blocked by bot detection or CAPTCHA is recorded with status `failed`; an application with `unresolvedFields` on a required field is recorded with status `needs_review` and is not submitted.
- FR-35 `[Core]` A live feed shows submission status per application.

### 5.7 Tracking
- FR-36 `[Core]` The application log records role, company, date, mode, status, and the submitted answer snapshot per application.
- FR-37 `[Core]` The dashboard shows applications submitted, jobs matched, and per-period counts.
- FR-38 `[Ext]` The product records interview and response status per application, sourced from user input or parsed email.

### 5.8 Account and billing
- FR-39 `[Core]` The product provides authentication and plan management.
- FR-40 `[Core]` The product meters `applicationsUsed` against `applicationsLimit` per billing period.
- FR-41 `[Core]` Billing runs through Stripe across the free, monthly, and annual plans.
- FR-42 `[Ext]` The product sells application credit packs consumable beyond a plan's limit.

## 6. Plans

| Plan | Price (USD) | Applications | Modes |
|---|---|---|---|
| Free | $0 | 10 total | Assisted |
| Starter | $19 / mo | 50 / mo | Assisted |
| Pro | $39 / mo | 200 / mo | Assisted + Auto |
| Power | $69 / mo | ~30 / day | Assisted + Auto |
| Annual | ~30% below monthly | per tier | per tier |

## 7. ATS support

| Tier | Platforms | Scope |
|---|---|---|
| 1 | Greenhouse, Lever, Ashby, Workable | `[Core]` (no-login forms; supported in both modes) |
| 2 | Teamtailor, SmartRecruiters, BambooHR, Recruitee | `[Ext]` |
| 3 | Workday, iCIMS, Taleo | `[Ext]` (account-gated) |

## 8. Constraints

- The product does not submit applications on LinkedIn or Indeed.
- The product does not store LinkedIn or Indeed passwords.
- Auto mode operates only on ATS forms that do not require an account.
- Assisted mode operates within the user's own browser and session.
- Every submission is bounded by a per-user daily cap and per-endpoint rate limits.
- Required fields without a profile-backed value resolve to `null` and are never fabricated.
- Resume and profile data are encrypted at rest.
- The product provides full data export and hard delete per user.

## 9. Stack

- Web app and API: Next.js (App Router), TypeScript, Tailwind, on Vercel.
- Browser extension: Manifest V3 (WXT or Plasmo).
- Database, auth, storage, embeddings: Supabase (Postgres, pgvector).
- Auto-apply workers: Playwright on a queue (BullMQ + Redis, or Trigger.dev), isolated from the web app.
- AI: Gemini 2.5 Flash / Flash-Lite (field answers, short text); Claude Sonnet (cover letters, fallback).
- Payments: Stripe.

## 10. Metrics

- Activation: share of signups that submit a first application.
- Time to first application.
- Applications submitted per active user per period.
- Free-to-paid conversion rate.
- Monthly churn rate.
- Cost per application (AI plus infrastructure).
- Reported interview rate per application `[Ext]`.
