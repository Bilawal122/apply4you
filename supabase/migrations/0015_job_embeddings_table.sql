-- Move job vectors off `jobs` so the HNSW index leaves the write path.
--
-- WHY (measured on prod, 2026-08-03, ~17k embedded jobs):
--
--   explain analyze update jobs set location = location
--     where id in (select id from jobs where embedding is not null limit 50);
--   -> Execution Time: 9905 ms, Buffers: shared hit=28452
--
-- 50 no-op row updates took 9.9s. Finding the rows took 6.6ms; the rest was
-- index maintenance. Postgres adds the new row version to EVERY index on a
-- rewrite, and `jobs` carried a 127MB HNSW vector index — so sourcing paid full
-- vector-graph insertion cost on every posting it touched, despite never
-- changing `embedding`. At ~198ms/row, any board over ~35 postings blew
-- PostgREST's 8s statement_timeout and could never complete a poll; 25 boards
-- holding ~46% of the index were permanently stuck (see commit 1242727).
--
-- After this migration the same statement runs in 319ms (~6ms/row, 31x faster)
-- and jobs' index footprint drops from 132MB to ~6MB.
--
-- RLS: no policies on purpose. match_jobs is SECURITY INVOKER and is only ever
-- called by the worker's service-role client (which bypasses RLS), so anon and
-- authenticated correctly get nothing.

create table if not exists job_embeddings (
  job_id uuid primary key references jobs(id) on delete cascade,
  embedding vector(1536) not null
);

alter table job_embeddings enable row level security;

-- Backfill before indexing: building HNSW once over the finished set is far
-- cheaper than maintaining it across 17k individual inserts.
insert into job_embeddings (job_id, embedding)
select id, embedding from jobs
where embedding is not null
on conflict (job_id) do nothing;

create index if not exists job_embeddings_hnsw_idx
  on job_embeddings using hnsw (embedding vector_cosine_ops);

-- A freshly populated table has no stats; without this the planner can ignore
-- the index it just built (same trap hit in 0012 after the sponsor swap).
analyze job_embeddings;

-- match_jobs now joins the vector table. Structure preserved deliberately from
-- 0007: plpgsql + `select ... into v_embedding` so the ORDER BY operand is a
-- plan-time variable, which is what lets the planner choose an HNSW index scan
-- (a correlated subquery or CTE join there forces a full scan — that was the
-- original 8s timeout). Verified after this change:
--   Index Scan using job_embeddings_hnsw_idx ... Execution Time: 53ms
-- and the returned job ids/scores are byte-identical to the previous function.
--
-- Also restores `set search_path = public`, which 0004 added as security
-- hardening and 0011's create-or-replace silently dropped.
create or replace function match_jobs(p_user_id uuid, p_limit int default 100)
returns table (job_id uuid, score int)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_embedding vector(1536);
  v_excluded_companies text[];
  v_excluded_keywords text[];
  v_overfetch int := p_limit * 3;
begin
  perform set_config('hnsw.ef_search', '400', true);

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
  with candidates as (
    select
      j.id as job_id,
      j.company_key,
      j.title_key,
      j.board_source_id,
      greatest(0, least(100, round((1 - (je.embedding <=> v_embedding)) * 100)))::int as score
    from job_embeddings je
    join jobs j on j.id = je.job_id
    where j.closed_at is null
      and j.requires_login = false
      and not exists (
        select 1 from unnest(coalesce(v_excluded_companies, '{}')) ec
        where lower(j.company) = lower(ec)
      )
      and not exists (
        select 1 from unnest(coalesce(v_excluded_keywords, '{}')) ek
        where j.title ilike '%' || ek || '%' or j.description ilike '%' || ek || '%'
      )
      and not exists (
        select 1 from applications a
        where a.user_id = p_user_id and a.job_id = j.id
      )
    order by je.embedding <=> v_embedding
    limit v_overfetch
  ),
  group_sizes as (
    select company_key, title_key, count(distinct board_source_id) as source_count
    from candidates group by company_key, title_key
  ),
  grouped as (
    select c.*, gs.source_count,
      row_number() over (partition by c.company_key, c.title_key order by c.score desc, c.job_id) as dupe_rank
    from candidates c
    join group_sizes gs on gs.company_key = c.company_key and gs.title_key = c.title_key
  )
  select g.job_id, g.score
  from grouped g
  where g.company_key = '' or g.title_key = '' or g.source_count <= 1 or g.dupe_rank = 1
  order by g.score desc
  limit p_limit;
end;
$$;

-- Dropping the column also drops jobs_embedding_idx. Catalog-only in Postgres,
-- so there is no table rewrite here.
alter table jobs drop column if exists embedding;
