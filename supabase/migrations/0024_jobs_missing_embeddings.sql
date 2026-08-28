-- Find open jobs that have no embedding, so the worker can close the gap.
--
-- WHY THIS IS NEEDED. A job is enqueued for embedding exactly once, by the poll
-- that first stores it (source-poll.ts), with the deterministic job id
-- `embed-job-<uuid>`. Both halves of that are load-bearing failures:
--
--   * If the `addBulk` throws — Redis unreachable — the enqueue is lost. The
--     rows are already upserted, so the next poll finds them in `existing`,
--     `newIds` is empty, and nothing ever asks for those embeddings again.
--   * If the embed job runs and fails, BullMQ retains it under that id, and
--     every later `add` with the same id is a silent no-op. The same trap that
--     made enqueueMissingProfileEmbeddings use a unique id.
--
-- Either way the job is invisible to matching forever: match_jobs joins through
-- job_embeddings, so an unembedded job cannot be returned by any query, for any
-- user, ever. It is in the index, it is counted, and it is unreachable.
--
-- Measured on prod when this was written: 3,072 of 26,388 open jobs (11.6%) had
-- no embedding, 148 of them UK-located — 10% of the entire UK supply, which is
-- the scarcest thing in the system. The dates give the cause away: 2,044 first
-- seen on 2026-08-03, 543 on 07-15, 468 on 07-14, spread across 42, 13 and 34
-- different boards. Three outage windows, not three bad boards. Descriptions
-- were fine (46 thin ones out of 2,044), so nothing about the jobs themselves
-- explains it.
--
-- An anti-join, not a `not in (...)`: the id list would be 23k uuids in a URL.
-- Returned as a function so the worker gets it in one round trip inside
-- PostgREST's 8s statement timeout.
--
-- `location` comes back with the id so the caller can order UK jobs first
-- without a second query. The UK test lives in packages/shared/src/uk.ts and
-- deliberately stays there — duplicating those regexes here would give us two
-- definitions of "UK" that drift apart.
create or replace function public.jobs_missing_embeddings(p_limit integer default 5000)
returns table(job_id uuid, location text)
language sql
stable
set search_path to 'public'
as $function$
  select j.id, j.location
  from jobs j
  where j.closed_at is null
    and not exists (select 1 from job_embeddings je where je.job_id = j.id)
  order by j.first_seen_at desc
  limit p_limit;
$function$;
