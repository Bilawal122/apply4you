-- Review-quality instrumentation (IMPROVEMENTS C2, required by DECISIONS.md D6).
--
-- D6 lists "median time-in-review and edit-rate on AI free text" as tracked
-- metrics and states plainly: "<10s median review is a red flag equal to a
-- failed submission." Nothing in the product captured either, so the friends
-- gate could not be evaluated at all. This is a gate blocker, not a feature.
--
-- Stored per application at the moment of approval, because that is the only
-- point where "did a human actually read this?" has an answer.
--
-- NOTE the deliberate design choice: approving in bulk records
-- opened = false and seconds = 0 rather than recording nothing. An unreviewed
-- approval is a real data point about review quality — arguably THE data point
-- D6 cares about — and silently omitting it would flatter the median.
alter table applications add column if not exists review_metrics jsonb;

comment on column applications.review_metrics is
  'Captured at approval: { openedCount, seconds, fieldsEdited, aiFieldsEdited, coverLetterEdited, bulk }. Null means approved before this existed. bulk=true means approved without the card ever being opened.';

-- The dashboard reads recent approvals to compute a median; this keeps that
-- scan cheap once the table grows.
create index if not exists applications_review_metrics_idx
  on applications (user_id, submitted_at desc)
  where review_metrics is not null;
