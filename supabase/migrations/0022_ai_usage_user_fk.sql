-- ai_usage.user_id pointed at nothing.
--
-- The account-delete route calls itself a "hard delete", and for every other
-- table it is one: profiles, preferences, applications, job_matches and
-- subscriptions all cascade from auth.users, and application_events cascades
-- through applications. ai_usage had no foreign key of any kind, so a deleted
-- account's rows kept its user id indefinitely — a retained identifier after a
-- deletion request, and the one table nobody would think to check.
--
-- SET NULL rather than CASCADE on purpose. This is the cost ledger behind the
-- D6 per-application spend gate; deleting an account should drop the link to a
-- person, not silently rewrite what the product has spent. The rows stay,
-- unattributed, and every aggregate report keeps working.
alter table ai_usage
  add constraint ai_usage_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
