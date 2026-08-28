-- Make the user's stated locations reach candidate selection.
--
-- 6% of the open index (1,586 of 26,388) is UK-located, and the product's wedge
-- is UK graduates. `preferences.locations` was written by the form and read by
-- nothing: absent from the embedding text, absent from ranking, absent from
-- here. The preferences form said so out loud — "not used for matching yet" —
-- and told the user to filter the feed by location instead, pointing at a
-- control that did not exist.
--
-- A ranking boost alone cannot fix this. This function returns the vector-
-- nearest `p_limit * 3` jobs out of 26k; when 94% of the index is in the wrong
-- country that overfetch is mostly noise before any boost runs, and no amount
-- of re-ordering can promote a job that never entered the pool. So the pool
-- itself has to know about location.
--
-- Two pools, unioned, rather than a filter:
--
--   * location strings are free text from four different ATSs — "London",
--     "London, UK", "London, United Kingdom", "Remote", "Hybrid", "Remote - US"
--     — so an ILIKE over them is a good preference and a terrible gate.
--     "Remote" and "Hybrid" alone are 385 open jobs with no country at all;
--     filtering on them would hide work the user can very likely do.
--   * so the location pool GUARANTEES matching jobs reach the ranker, and the
--     unrestricted pool guarantees nothing is ever hidden outright. The boost
--     in packages/shared/src/matching.ts then orders them.
--
-- With no locations set the first pool is empty and behaviour is exactly as
-- before.
--
-- PERFORMANCE — the reason both pools repeat their filters instead of sharing a
-- CTE. An earlier draft hoisted the common predicates into an `eligible` CTE
-- and selected from it. That was measurably wrong: `order by embedding <=> …`
-- over a CTE result cannot use the HNSW index, so Postgres materialised ~23k
-- rows and sorted every one of them, twice. The function went from 39ms to
-- 9.8s. Written against the base tables the planner uses the index for the
-- unrestricted pool, and the location pool's ILIKE cuts the set to ~1.5k rows
-- before any distance is computed. Duplicated predicates are the price of an
-- index scan, and worth paying.
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
