-- match_jobs timed out (statement_timeout=8s via PostgREST) once jobs grew past ~16k
-- embedded rows: the SQL-function form joined the profile embedding in from a CTE,
-- which prevents the planner from using the HNSW index (the ORDER BY operand must be
-- a plan-time constant/parameter), forcing a sequential scan over every vector.
-- plpgsql form: SELECT the embedding into a variable first -> HNSW index scan.
-- Measured: >8000ms (timeout) -> <1ms at 16k embedded jobs.
--
-- Notes: volatile (not stable) because set_config is not allowed in non-volatile
-- functions, and Supabase blocks function-level `SET hnsw.ef_search` (supautils);
-- ef_search must exceed p_limit so post-scan preference filters still leave
-- enough candidates.

create or replace function match_jobs(p_user_id uuid, p_limit int default 100)
returns table (job_id uuid, score int)
language plpgsql
volatile
security invoker
as $$
declare
  v_embedding vector(1536);
  v_excluded_companies text[];
  v_excluded_keywords text[];
begin
  -- HNSW returns at most ef_search ordered candidates. Local to this txn.
  perform set_config('hnsw.ef_search', '200', true);

  select p.embedding into v_embedding
  from profiles p
  where p.user_id = p_user_id and p.embedding is not null;
  if v_embedding is null then
    return;
  end if;

  select coalesce(pr.excluded_companies, '{}'), coalesce(pr.excluded_keywords, '{}')
  into v_excluded_companies, v_excluded_keywords
  from preferences pr
  where pr.user_id = p_user_id;

  return query
  select
    j.id as job_id,
    -- cosine similarity in [~0..1] -> 0..100; clamp negatives.
    greatest(0, least(100, round((1 - (j.embedding <=> v_embedding)) * 100)))::int as score
  from jobs j
  where j.closed_at is null
    and j.embedding is not null
    and j.requires_login = false
    -- excluded companies (case-insensitive exact)
    and not exists (
      select 1 from unnest(coalesce(v_excluded_companies, '{}')) ec
      where lower(j.company) = lower(ec)
    )
    -- excluded keywords in title or description
    and not exists (
      select 1 from unnest(coalesce(v_excluded_keywords, '{}')) ek
      where j.title ilike '%' || ek || '%' or j.description ilike '%' || ek || '%'
    )
    -- never resurface jobs the user already has an application for
    and not exists (
      select 1 from applications a
      where a.user_id = p_user_id and a.job_id = j.id
    )
  order by j.embedding <=> v_embedding
  limit p_limit;
end;
$$;
