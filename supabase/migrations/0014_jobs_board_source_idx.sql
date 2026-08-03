-- Sourcing scans a board's live postings every poll (to find the ones that
-- vanished and should be closed), but `board_source_id` had no index, so every
-- poll seq-scanned the whole jobs table. Cheap to add, and it matters more now
-- that polls run concurrently across ~294 boards.
create index if not exists jobs_board_source_open_idx
  on jobs (board_source_id)
  where closed_at is null;
