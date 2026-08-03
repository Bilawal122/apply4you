-- Sponsor verdicts (tasks #27 + #41, DECISIONS.md D5, ROADMAP 1.1-1.2).
-- Home Office "Worker and Temporary Worker" register (public CSV, ~126k orgs,
-- refreshed ~weekly by the Home Office) joined to jobs via the SAME
-- normalize_company_name() key the cross-source dedupe (0011) added — one
-- normalization algorithm everywhere.
--
-- Conservative-labeling rule (D5): a verdict says an employer HOLDS a licence
-- on a given register date — never that it "sponsors this role". Salary
-- thresholds are deliberately absent: our job rows carry no salary data, and
-- publishing a wrong visa number is worse than none (YMYL).
--
-- Timeout-aware design: every worker call arrives via PostgREST, which
-- carries the authenticator role's 8s statement_timeout (the same wall that
-- broke match_jobs at 16k jobs). So the weekly refresh is split into calls
-- that each finish well under 8s:
--   1. stage_sponsors(batch)   × ~29 — inserts ~5k rows AND computes keys
--   2. finalize_sponsor_swap() × 1  — atomic truncate+copy, no per-row fns
--   3. apply_sponsor_verdicts()× 1  — set-based re-verdict of all jobs
-- A function body is one transaction, so a failed swap leaves the previous
-- register intact.

create table sponsors (
  company_key text not null,
  org_name text not null,
  town text,
  county text,
  type_rating text,        -- e.g. "Worker (A rating)"
  route text,              -- e.g. "Skilled Worker"
  register_date date not null
);
create index sponsors_key_idx on sponsors (company_key);

-- Public government data: world-readable by design.
alter table sponsors enable row level security;
create policy "sponsors are public data" on sponsors for select to anon, authenticated using (true);

create unlogged table sponsor_staging (
  company_key text,
  org_name text not null,
  town text,
  county text,
  type_rating text,
  route text
);
alter table sponsor_staging enable row level security; -- service-role only; no policies.

alter table jobs add column if not exists sponsor_verdict jsonb;

-- Verdict for one company key: single index-scan aggregate (this also runs
-- per-row in the jobs trigger during every poll upsert, so it must be cheap).
create or replace function sponsor_verdict_for(p_company_key text)
returns jsonb
language sql
stable
as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'licensed', true,
    'org_name', min(org_name),
    'routes', jsonb_agg(distinct route) filter (where route is not null),
    'ratings', jsonb_agg(distinct type_rating) filter (where type_rating is not null),
    'register_date', to_char(max(register_date), 'YYYY-MM-DD')
  ) end
  from sponsors
  where company_key = p_company_key and coalesce(p_company_key, '') <> '';
$$;

-- New/repolled jobs get a verdict on arrival. Runs AFTER
-- jobs_dedupe_keys_trigger in the BEFORE chain (same-event triggers fire
-- alphabetically: 'd' < 's'), so NEW.company_key is already populated.
create or replace function jobs_set_sponsor_verdict()
returns trigger
language plpgsql
as $$
begin
  new.sponsor_verdict := sponsor_verdict_for(new.company_key);
  return new;
end;
$$;

drop trigger if exists jobs_sponsor_verdict_trigger on jobs;
create trigger jobs_sponsor_verdict_trigger
  before insert or update of company on jobs
  for each row execute function jobs_set_sponsor_verdict();

-- Reset staging at the START of a refresh run (review finding: a run that
-- fails mid-way previously left residue that merged into the NEXT run's
-- SELECT DISTINCT, resurrecting sponsors revoked between editions — the
-- exact YMYL failure this module is supposed to prevent).
create or replace function reset_sponsor_staging()
returns void
language sql
security invoker
as $$
  truncate sponsor_staging;
$$;

-- Batch loader (worker calls with ~5k rows per call; keys computed here so
-- the swap needs no per-row function calls).
create or replace function stage_sponsors(p_rows jsonb)
returns int
language plpgsql
security invoker
as $$
declare
  v_count int;
begin
  insert into sponsor_staging (company_key, org_name, town, county, type_rating, route)
  select normalize_company_name(r->>'org_name'), r->>'org_name', r->>'town', r->>'county', r->>'type_rating', r->>'route'
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'org_name', '') <> '';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function finalize_sponsor_swap(p_register_date date)
returns int
language plpgsql
security invoker
as $$
declare
  v_sponsors int;
begin
  if (select count(*) from sponsor_staging) < 10000 then
    raise exception 'staging has suspiciously few rows (%) — refusing to replace the register', (select count(*) from sponsor_staging);
  end if;

  truncate sponsors;
  insert into sponsors (company_key, org_name, town, county, type_rating, route, register_date)
  select distinct company_key, org_name, town, county, type_rating, route, p_register_date
  from sponsor_staging
  where coalesce(company_key, '') <> '';
  get diagnostics v_sponsors = row_count;

  truncate sponsor_staging;
  -- Fresh 142k-row insert has no planner statistics yet (autoanalyze hasn't
  -- run) — without this, apply_sponsor_verdicts' join can pick a bad plan and
  -- blow PostgREST's 8s authenticator timeout (reproduced live: it did).
  analyze sponsors;
  return v_sponsors;
end;
$$;

-- Set-based re-verdict: grouped pass over ONLY the sponsor keys that exist in
-- jobs (~hundreds, never the full 126k-org register — the full-register
-- version blew PostgREST's 8s timeout on first run) + one hash-join update.
create or replace function apply_sponsor_verdicts()
returns int
language plpgsql
security invoker
as $$
declare
  v_set int;
begin
  update jobs j
  set sponsor_verdict = v.verdict
  from (
    select s.company_key, jsonb_build_object(
      'licensed', true,
      'org_name', min(s.org_name),
      'routes', jsonb_agg(distinct s.route) filter (where s.route is not null),
      'ratings', jsonb_agg(distinct s.type_rating) filter (where s.type_rating is not null),
      'register_date', to_char(max(s.register_date), 'YYYY-MM-DD')
    ) as verdict
    from sponsors s
    where exists (select 1 from jobs j2 where j2.company_key = s.company_key)
    group by s.company_key
  ) v
  where v.company_key = j.company_key
    and j.sponsor_verdict is distinct from v.verdict;
  get diagnostics v_set = row_count;

  update jobs j
  set sponsor_verdict = null
  where j.sponsor_verdict is not null
    and not exists (select 1 from sponsors s where s.company_key = j.company_key);

  return v_set;
end;
$$;

-- Worker-only surfaces; verdict lookup is public (checker page).
revoke execute on function reset_sponsor_staging() from public, anon, authenticated;
revoke execute on function stage_sponsors(jsonb) from public, anon, authenticated;
revoke execute on function finalize_sponsor_swap(date) from public, anon, authenticated;
revoke execute on function apply_sponsor_verdicts() from public, anon, authenticated;
grant execute on function sponsor_verdict_for(text) to anon, authenticated;

-- Rate limiting for the public /check page (review finding: unauth,
-- unlimited leading-wildcard scans over ~126k sponsor rows). DB-backed
-- because the page runs across stateless serverless invocations — an
-- in-process counter wouldn't persist between requests.
create table check_rate_limit (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 1
);

create or replace function check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_allowed boolean;
begin
  insert into check_rate_limit (rate_key, window_start, count)
  values (p_key, now(), 1)
  on conflict (rate_key) do update set
    count = case
      when check_rate_limit.window_start < now() - make_interval(secs => p_window_seconds)
      then 1
      else check_rate_limit.count + 1
    end,
    window_start = case
      when check_rate_limit.window_start < now() - make_interval(secs => p_window_seconds)
      then now()
      else check_rate_limit.window_start
    end;

  select count <= p_max into v_allowed from check_rate_limit where rate_key = p_key;
  return coalesce(v_allowed, true);
end;
$$;

-- No policies/grants for authenticated or anon: the /check page calls this
-- via the admin client (service role) so end users can't manipulate their
-- own rate-limit counters.
alter table check_rate_limit enable row level security;
revoke execute on function check_rate_limit(text, int, int) from public, anon, authenticated;
