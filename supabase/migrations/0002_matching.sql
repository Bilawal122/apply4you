-- Matching: cosine similarity + preference hard filters, mapped to 0-100.
-- SECURITY INVOKER + explicit user_id parameter; called by the worker (service role).

create or replace function match_jobs(p_user_id uuid, p_limit int default 100)
returns table (job_id uuid, score int)
language sql
stable
security invoker
as $$
  with prefs as (
    select * from preferences where user_id = p_user_id
  ),
  prof as (
    select embedding from profiles where user_id = p_user_id and embedding is not null
  )
  select
    j.id as job_id,
    -- cosine similarity in [~0..1] -> 0..100; clamp negatives.
    greatest(0, least(100, round((1 - (j.embedding <=> prof.embedding)) * 100)))::int as score
  from jobs j, prof, prefs
  where j.closed_at is null
    and j.embedding is not null
    and j.requires_login = false
    -- excluded companies (case-insensitive exact)
    and not exists (
      select 1 from unnest(prefs.excluded_companies) ec
      where lower(j.company) = lower(ec)
    )
    -- excluded keywords in title or description
    and not exists (
      select 1 from unnest(prefs.excluded_keywords) ek
      where j.title ilike '%' || ek || '%' or j.description ilike '%' || ek || '%'
    )
    -- never resurface jobs the user already has an application for
    and not exists (
      select 1 from applications a
      where a.user_id = p_user_id and a.job_id = j.id
    )
  order by j.embedding <=> prof.embedding
  limit p_limit;
$$;
