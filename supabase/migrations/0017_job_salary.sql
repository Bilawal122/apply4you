-- Employer-published compensation, stored ONLY as the ATS structured it.
--
-- Measured across all four sources on 2026-08-04 by probing the live APIs:
--   lever      salaryRange {min,max,currency,interval}          -> available
--   ashby      compensation{} with ?includeCompensation=true    -> available when
--              the employer opts in (Ramp 116/122, Replit 78/89, Vanta 59/98;
--              Notion and Linear publish none)
--   greenhouse nothing on the board list OR the single-job endpoint (metadata
--              was null too)                                    -> never
--   workable   nothing on the widget endpoint                   -> never
--
-- Greenhouse alone is ~12.5k of ~26k live jobs, so roughly half the index can
-- never carry a figure. The UI says "not stated" for those rather than
-- estimating: a wrong salary is the single most damaging number to invent, and
-- 0012 already set this precedent by refusing to publish visa salary
-- thresholds we could not back.
--
-- salary_summary keeps the employer's own wording ("$211.4K – $290.6K • Offers
-- Equity") because it often carries equity/bonus context a numeric range drops.
-- salary_source records which API field produced it, so any figure on screen is
-- traceable back to its origin.

alter table jobs add column if not exists salary_min numeric;
alter table jobs add column if not exists salary_max numeric;
alter table jobs add column if not exists salary_currency text;
alter table jobs add column if not exists salary_period text;
alter table jobs add column if not exists salary_summary text;
alter table jobs add column if not exists salary_source text;

comment on column jobs.salary_source is
  'Which ATS field produced the figure (e.g. lever.salaryRange, ashby.compensation). Null means the employer published none — never estimate.';

-- Partial index: "has a salary" is a filter users will want, and it is a
-- minority of rows, so the index stays small.
create index if not exists jobs_salary_open_idx
  on jobs (salary_min)
  where closed_at is null and salary_min is not null;
