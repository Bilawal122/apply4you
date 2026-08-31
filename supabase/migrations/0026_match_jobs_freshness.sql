-- Freshness in the candidate pool — the SQL half of P1-02.
--
-- packages/shared/src/matching.ts already demotes stale roles in the final
-- ranking, but that happens AFTER match_jobs has chosen which p_limit rows
-- survive, so the pool itself still filled with old postings and the
-- demotion only reordered them. This adds the same penalty to `sort_score`,
-- the term that decides pool survival — exactly how LOCATION_BOOST is
-- mirrored here.
--
-- Supersedes the definition in 0023_location_matching.sql. Everything else
-- about the function, including the performance notes below, is unchanged.

create or replace function public.match_jobs(p_user_id uuid, p_limit integer default 100)
returns table(job_id uuid, score integer)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_embedding vector(1536);
  v_excluded_companies text[];
  v_excluded_keywords text[];
  v_locations text[];
  v_overfetch int := p_limit * 3;
begin
  perform set_config('hnsw.ef_search', '400', true);

  select p.embedding into v_embedding
  from profiles p
  where p.user_id = p_user_id and p.embedding is not null;
  if v_embedding is null then
    return;
  end if;

  select coalesce(pr.excluded_companies, '{}'), coalesce(pr.excluded_keywords, '{}'),
         coalesce(pr.locations, '{}')
  into v_excluded_companies, v_excluded_keywords, v_locations
  from preferences pr
  where pr.user_id = p_user_id;

  return query
  -- Pool 1: nearest jobs whose location mentions one of the user's.
  with by_location as (
    select j.id as jid
    from job_embeddings je
    join jobs j on j.id = je.job_id
    where cardinality(v_locations) > 0
      and j.closed_at is null
      and j.requires_login = false
      and j.location is not null
      and exists (
        select 1 from unnest(v_locations) loc
        where btrim(loc) <> '' and j.location ilike '%' || btrim(loc) || '%'
      )
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
  -- Pool 2: nearest jobs overall, so a narrow or unmatchable location string
  -- can never empty the feed. Identical to the pre-location behaviour.
  by_vector as (
    select j.id as jid
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
  -- Aliased `jid` rather than `job_id`: this function's RETURNS TABLE declares
  -- `job_id` as an OUT parameter, so an unqualified reference to it inside the
  -- body is ambiguous between the column and the PL/pgSQL variable, and the
  -- function fails at runtime rather than at create time.
  pooled as (
    select bl.jid from by_location bl
    union
    select bv.jid from by_vector bv
  ),
  -- Two scores on purpose.
  --
  -- `score` is the raw vector score and is what this function RETURNS, because
  -- packages/shared/src/matching.ts owns scoring and applies the location,
  -- title and sponsor boosts itself — returning a pre-boosted score here would
  -- have rankMatches add the location bonus a second time.
  --
  -- `sort_score` exists only to decide which p_limit rows survive. Without it
  -- the pool was pointless: by_location dutifully collected 300 location
  -- matches and the final `order by score desc limit 100` then dropped almost
  -- all of them, because a Manchester job that is a slightly weaker semantic
  -- match still loses on raw distance. Measured on a real account before this:
  -- 12 of 100 matched the user's locations and none were in Manchester,
  -- despite 40 open embedded Manchester jobs existing and entering the pool.
  candidates as (
    select j.id as jid, j.company_key, j.title_key, j.board_source_id,
           greatest(0, least(100, round((1 - (je.embedding <=> v_embedding)) * 100)))::int as score,
           greatest(0, least(100, round((1 - (je.embedding <=> v_embedding)) * 100)))::int
             + case
                 when cardinality(v_locations) > 0 and j.location is not null and exists (
                   select 1 from unnest(v_locations) loc
                   where btrim(loc) <> '' and j.location ilike '%' || btrim(loc) || '%'
                 ) then 12  -- keep in step with LOCATION_BOOST in packages/shared/src/matching.ts
                 else 0
               end
             - case
                 -- Freshness (P1-02). Measured on production when this was
                 -- written: 44% of open jobs were older than 90 days, and one
                 -- real account's 173 matches were 113 stale / 60 visible —
                 -- the pool filled with roles the feed then hid, so the user
                 -- lost most of their 100 slots to postings they would never
                 -- be shown. Vector distance has no opinion about age; this
                 -- gives fresher roles the pool seats.
                 --
                 -- sort_score only, never `score`: rankMatches applies
                 -- STALE_PENALTY to the returned score itself, and
                 -- pre-penalising here would charge a stale job twice.
                 when coalesce(j.posted_at, j.first_seen_at)
                        < now() - interval '45 days'  -- STALE_AFTER_DAYS
                 then 10  -- keep in step with STALE_PENALTY in packages/shared/src/matching.ts
                 else 0
               end as sort_score
    from pooled p
    join jobs j on j.id = p.jid
    join job_embeddings je on je.job_id = j.id
  ),
  group_sizes as (
    select c.company_key, c.title_key, count(distinct c.board_source_id) as source_count
    from candidates c group by c.company_key, c.title_key
  ),
  grouped as (
    select c.*, gs.source_count,
      row_number() over (partition by c.company_key, c.title_key order by c.sort_score desc, c.jid) as dupe_rank
    from candidates c
    join group_sizes gs on gs.company_key = c.company_key and gs.title_key = c.title_key
  )
  select g.jid, g.score
  from grouped g
  where g.company_key = '' or g.title_key = '' or g.source_count <= 1 or g.dupe_rank = 1
  order by g.sort_score desc
  limit p_limit;
end;
$function$;
