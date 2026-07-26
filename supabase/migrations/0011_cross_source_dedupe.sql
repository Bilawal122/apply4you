-- Cross-source job dedupe (task #28). Confirmed real: board_sources already
-- contains the same company on multiple ATSs (e.g. greenhouse/clickhouse AND
-- ashby/clickhouse) — when a company cross-posts the same req to two boards,
-- the two rows have different (ats_type, external_id) so both survive the
-- existing unique constraint and both can surface as separate matches,
-- burning two feed slots / two daily-cap units for one real job.
--
-- Approach: normalize company + title into plain (not generated) columns
-- maintained by a trigger, then in match_jobs() collapse groups that span >1
-- distinct board_source_id down to their single best-scoring row. Jobs are
-- never deleted or merged — this only changes which candidate wins a
-- duplicate group at match time, so it's fully reversible and doesn't touch
-- anything already in job_matches/applications.
--
-- Plain trigger-maintained columns, NOT `generated always as (...) stored`:
-- a stored generated column forces Postgres to rewrite the whole table AND
-- rebuild every index on it (including the HNSW vector index) the moment the
-- column is added — on this table that meant a multi-minute exclusive-lock
-- rewrite that outlived the migration tool's own connection and rolled back.
-- A plain column + BEFORE INSERT/UPDATE trigger gets the same always-correct
-- values with none of that cost; existing rows are backfilled via UPDATE.
--
-- Known gap (acceptable for v1): if a user already applied to one copy of a
-- cross-posted job, its duplicate on another board is no longer excluded by
-- the "not already applied" filter's twin (only the exact job_id is
-- excluded), so the twin can still surface later as an apparently-new match.
-- Closing that fully needs company_key/title_key tracked on applications too
-- — deferred until it proves to matter in practice.

create or replace function normalize_company_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_tokens text[];
  v_suffixes text[] := array[
    'ltd','limited','plc','llp','lp','inc','incorporated','corp','corporation',
    'co','company','uk','gb','group','holdings','holding','international',
    'technologies','technology','tech','labs','lab','systems','software',
    'solutions','services','ventures','global','hq'
  ];
begin
  if p_name is null then return null; end if;
  v_tokens := array_remove(
    regexp_split_to_array(
      trim(regexp_replace(lower(replace(p_name, '&', ' and ')), '[^a-z0-9]+', ' ', 'g')),
      '\s+'
    ),
    ''
  );
  while array_length(v_tokens, 1) > 1 and v_tokens[array_length(v_tokens, 1)] = any(v_suffixes) loop
    v_tokens := v_tokens[1:array_length(v_tokens, 1) - 1];
  end loop;
  return array_to_string(v_tokens, ' ');
end;
$$;

create or replace function normalize_title_key(p_title text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

alter table jobs add column if not exists company_key text;
alter table jobs add column if not exists title_key text;

create or replace function jobs_set_dedupe_keys()
returns trigger
language plpgsql
as $$
begin
  new.company_key := normalize_company_name(new.company);
  new.title_key := normalize_title_key(new.title);
  return new;
end;
$$;

drop trigger if exists jobs_dedupe_keys_trigger on jobs;
create trigger jobs_dedupe_keys_trigger
  before insert or update of company, title on jobs
  for each row execute function jobs_set_dedupe_keys();

-- Backfill for rows that predate the trigger. Safe to re-run.
update jobs
set company_key = normalize_company_name(company),
    title_key = normalize_title_key(title)
where company_key is null or title_key is null;

create index if not exists jobs_dedupe_idx on jobs (company_key, title_key) where closed_at is null;

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
  v_overfetch int := p_limit * 3;
begin
  -- HNSW returns at most ef_search ordered candidates; must exceed v_overfetch
  -- (raised from 200 now that dedupe needs extra headroom past p_limit).
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
    limit v_overfetch
  ),
  -- DISTINCT is not allowed inside a window aggregate, so the distinct-board
  -- count is a plain GROUP BY, joined back rather than computed as OVER(...).
  group_sizes as (
    select company_key, title_key, count(distinct board_source_id) as source_count
    from candidates
    group by company_key, title_key
  ),
  grouped as (
    select
      c.*,
      gs.source_count,
      row_number() over (partition by c.company_key, c.title_key order by c.score desc, c.job_id) as dupe_rank
    from candidates c
    join group_sizes gs on gs.company_key = c.company_key and gs.title_key = c.title_key
  )
  select g.job_id, g.score
  from grouped g
  where
    -- degenerate keys (empty after normalization) never get grouped — safer
    -- to over-show than to accidentally cluster unrelated postings.
    g.company_key = '' or g.title_key = ''
    -- only one board ever posted this (company_key, title_key): pass through.
    or g.source_count <= 1
    -- true cross-source duplicate group: only its best-scoring row survives.
    or g.dupe_rank = 1
  order by g.score desc
  limit p_limit;
end;
$$;
