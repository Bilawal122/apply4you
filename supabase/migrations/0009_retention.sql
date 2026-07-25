-- Data retention (DECISIONS.md D4): the jobs table doubled to ~18k rows in one
-- week of sourcing and 1536-dim vectors are the free-tier disk wall. Closed
-- jobs nobody applied to are purged after 30 days; anything a user DID apply
-- to is snapshotted onto the application row at submit time (immutable,
-- retained indefinitely — interview prep lands 4-8 weeks out and the audit
-- trail of what was told to employers must survive the purge).

alter table applications add column if not exists job_snapshot jsonb;

-- Purge is an RPC so the worker's daily job deletes atomically and reports a
-- count. job_matches rows are removed explicitly — do not rely on FK cascade.
create or replace function purge_closed_jobs(p_days int default 30)
returns int
language plpgsql
security invoker
as $$
declare
  v_count int;
begin
  delete from job_matches jm
  using jobs j
  where jm.job_id = j.id
    and j.closed_at is not null
    and j.closed_at < now() - make_interval(days => p_days)
    and not exists (select 1 from applications a where a.job_id = j.id);

  delete from jobs j
  where j.closed_at is not null
    and j.closed_at < now() - make_interval(days => p_days)
    and not exists (select 1 from applications a where a.job_id = j.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Worker-only surface: revoke from API roles so PostgREST callers can't purge.
revoke execute on function purge_closed_jobs(int) from public, anon, authenticated;
