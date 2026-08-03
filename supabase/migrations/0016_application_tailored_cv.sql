-- Application packet (task #40): the per-job tailored CV selection.
--
-- Stores the model's SELECTION (indices into the user's profile), not rendered
-- CV text — see packages/shared/src/schemas/packet.ts for why. Keeping it as a
-- selection means the document is re-derivable from the profile at any time,
-- and that a stored row can never contain experience the user didn't write.
alter table applications add column if not exists tailored_cv jsonb;

comment on column applications.tailored_cv is
  'TailoredCv selection (role/bullet/skill indices + summary + rationale). Resolve to content with resolveTailoredCv(profile, cv).';
