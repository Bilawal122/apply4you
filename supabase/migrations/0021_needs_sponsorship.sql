-- Sponsorship as a stated need, not a session-scoped feed filter.
--
-- The wedge is UK graduates and international students who require Skilled
-- Worker sponsorship, and until now the product asked them about it exactly
-- once: `?sponsored=1` in the feed URL, which resets every visit. Ranking had
-- no sponsorship term at all, so onboarding's auto-queue could spend a new
-- user's first ten applications — the whole of the free tier — at employers
-- that hold no licence and legally cannot hire them.
--
-- Defaults to false so every existing account keeps its current behaviour;
-- it only ever turns on when someone says so.
alter table preferences
  add column needs_sponsorship boolean not null default false;

comment on column preferences.needs_sponsorship is
  'User requires UK visa sponsorship. Boosts licensed sponsors in ranking and excludes unlicensed employers from auto-queue. A licence means an employer CAN sponsor — never that this role IS sponsored (DECISIONS.md D5).';
