-- Answer Library (task #31): answers a CV can never contain, collected once.
--
-- The resolver nulls anything it cannot ground in the profile, so questions
-- like expected salary, notice period and visa sponsorship reliably park an
-- application in needs_review. Every one of those is answerable in advance by
-- the user. Storing them lets the resolver fill those fields deterministically,
-- from the user's own words — no model call, so the no-fabrication guarantee is
-- untouched.
--
-- jsonb on profiles rather than a side table: this is a small, user-scoped bag
-- of key -> answer that is always read together with the profile, and profiles
-- already carries the right RLS.
alter table profiles add column if not exists answer_library jsonb not null default '{}'::jsonb;

comment on column profiles.answer_library is
  'Answer Library: { question_key: answer }. User-authored. Keys are defined in packages/shared/src/answer-library.ts. Demographic/EEO questions must never be stored here (DECISIONS.md D3.5).';

-- Which fields were filled from the library, so the review screen can show
-- "you wrote this" instead of inferring provenance (IMPROVEMENTS.md C7).
alter table applications add column if not exists answer_sources jsonb not null default '{}'::jsonb;

comment on column applications.answer_sources is
  'fieldId -> provenance ("library" | "profile" | "ai"). Recorded at resolve time, never inferred at render time.';
