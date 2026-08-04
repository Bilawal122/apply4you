-- Projects on the profile.
--
-- The founder's own CV (and most junior/career-changer CVs) leads with a
-- Projects section, but ProfileSchema had no home for one — so the resume
-- parser silently dropped it and every tailored CV we generated was missing a
-- section the candidate actually had. Measured on the live profile before this
-- change: 2 roles, 3-5 bullets total, no projects. That is why the generated CV
-- read thin.
alter table profiles add column if not exists projects jsonb not null default '[]'::jsonb;

comment on column profiles.projects is
  'ProjectEntry[]: { name, tech, url, bullets[] }. Parsed from the CV and user-editable.';
