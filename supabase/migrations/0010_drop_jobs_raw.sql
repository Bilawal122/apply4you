-- Free-tier overage fix (2026-07-26): DB hit 523MB / 500MB cap. jobs.raw held
-- the original ATS API payload per job — 96MB of TOAST at ~18k jobs, rewritten
-- on every poll, and never read anywhere (adapters read forms live from the
-- ATS APIs; grep confirms the only reference was the write in source-poll.ts).
-- Space returns to the OS via VACUUM FULL, run manually after this migration.

alter table jobs drop column if exists raw;
