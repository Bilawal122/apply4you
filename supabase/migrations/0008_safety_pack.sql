-- Pre-submission safety pack (DECISIONS.md D3).

-- 1. needs_manual_verification: a worker restart mid-submission leaves a row in
--    'submitting' where the click may or may not have landed. Boot-time
--    reconciliation parks those here; they are NEVER auto-requeued — a human
--    checks the ATS confirmation email / candidate view first.
alter table applications drop constraint applications_status_check;
alter table applications add constraint applications_status_check check (status in
  ('draft','needs_review','approved','submitting','submitted','skipped','failed','needs_manual_verification'));

-- 2. Per-ATS circuit breaker: consecutive submission failures trip the breaker
--    and pause that ATS's submissions until manually re-armed (paused=false).
--    Captcha-rate is the leading indicator of bot detection / a ban forming.
create table ats_health (
  ats_type text primary key check (ats_type in ('greenhouse','lever','ashby','workable')),
  consecutive_failures int not null default 0,
  paused boolean not null default false,
  last_failure_reason text,
  updated_at timestamptz not null default now()
);
insert into ats_health (ats_type) values ('greenhouse'), ('lever'), ('ashby'), ('workable');

-- Operator/worker data only (service role); no user-facing policies.
alter table ats_health enable row level security;
