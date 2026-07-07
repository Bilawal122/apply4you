-- handle_new_user is a trigger function only — never callable via RPC.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Pin search_path on match_jobs (advisor 0011).
alter function public.match_jobs(uuid, int) set search_path = public;
