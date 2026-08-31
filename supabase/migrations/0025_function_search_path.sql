-- Pin search_path on every first-party function that lacked one.
--
-- Supabase's security advisor (lint 0011_function_search_path_mutable) flags
-- these: a function with a mutable search_path resolves its unqualified names
-- against whatever the CALLER's search_path happens to be, so anyone able to
-- create an object in an earlier schema can shadow a table or operator the
-- body relies on. handle_new_user, match_jobs and jobs_missing_embeddings
-- already pinned `public`; this brings the rest in line.
--
-- ALTER rather than CREATE OR REPLACE on purpose: the bodies are correct and
-- rewriting them here would fork them from the migrations that own them.
-- Behaviour is unchanged — every one of these already resolved to `public`,
-- this makes it explicit rather than incidental. `public` (not `''`) because
-- the vector extension lives there and the bodies reference its types.

alter function public.apply_sponsor_verdicts() set search_path = public;
alter function public.check_rate_limit(text, integer, integer) set search_path = public;
alter function public.finalize_sponsor_swap(date) set search_path = public;
alter function public.jobs_set_dedupe_keys() set search_path = public;
alter function public.jobs_set_sponsor_verdict() set search_path = public;
alter function public.normalize_company_name(text) set search_path = public;
alter function public.normalize_title_key(text) set search_path = public;
alter function public.purge_closed_jobs(integer) set search_path = public;
alter function public.reset_sponsor_staging() set search_path = public;
alter function public.sponsor_verdict_for(text) set search_path = public;
alter function public.stage_sponsors(jsonb) set search_path = public;
