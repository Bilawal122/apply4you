-- The weekly sponsor-register refresh had been failing silently for a month.
--
-- finalize_sponsor_swap rewrites the whole ~142k-row register (truncate +
-- SELECT DISTINCT + insert + index maintenance + analyze). PostgREST runs it
-- as service_role, which had no rolconfig of its own and so inherited
-- authenticator's 8s statement_timeout. Warm, the swap is ~2-4s; cold it goes
-- past 8s, so the job died with 57014 and left the register frozen at
-- 2026-08-03 while gov.uk had already published 2026-09-01. Every failure
-- path correctly kept the previous register live, which is exactly why this
-- was silent: the /check page kept answering, just from month-old data.
--
-- Raising the ceiling is the only fix that works. statement_timeout is armed
-- when the outer statement begins, so neither `set local statement_timeout`
-- inside the function nor `alter function ... set statement_timeout` can
-- rescue an already-running RPC — both were verified empirically to fail.
-- PostgREST applies per-role settings at transaction start, so the setting
-- has to live on the role itself.
--
-- Scope: service_role is backend-only (worker + server routes). anon (3s) and
-- authenticated (8s) are untouched, so nothing user-facing is widened.
alter role service_role set statement_timeout = '60s';

notify pgrst, 'reload config';
