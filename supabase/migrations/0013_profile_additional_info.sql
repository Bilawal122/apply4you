-- "Additional info" free-text box on the profile (VISION.md §2a / ROADMAP 1.3):
-- context the AI can't get from a parsed CV — career goals, constraints,
-- things to always mention. Fed into field-resolution, cover-letter, and
-- match-reason prompts alongside the rest of the profile.
alter table profiles add column if not exists additional_info text not null default '';
