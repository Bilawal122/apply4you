-- AI token usage + estimated cost per call, for the "cost per application" metric.
-- Written by the service role (worker + web); no user policies (operator/admin metric).
create table ai_usage (
  id bigint generated always as identity primary key,
  operation text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_tokens int not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  user_id uuid,
  application_id uuid,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on ai_usage (created_at desc);
create index ai_usage_operation_idx on ai_usage (operation);

alter table ai_usage enable row level security;
-- No policies: only the service role (which bypasses RLS) reads/writes this.
