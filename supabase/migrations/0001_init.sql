-- Auto-Apply initial schema
create extension if not exists vector;

-- ============ profiles (1:1 auth.users) ============
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  location text,
  links jsonb not null default '{}',
  work_authorization text,
  work_history jsonb not null default '[]',
  education jsonb not null default '[]',
  skills text[] not null default '{}',
  resume_storage_path text,
  resume_filename text,
  summary text,
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

-- ============ preferences ============
create table preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  titles text[] not null default '{}',
  locations text[] not null default '{}',
  work_model text[] not null default '{}',
  salary_floor int,
  seniority text[] not null default '{}',
  industries text[] not null default '{}',
  excluded_companies text[] not null default '{}',
  excluded_keywords text[] not null default '{}',
  daily_cap int not null default 25 check (daily_cap between 1 and 100),
  auto_submit boolean not null default false
);

-- ============ board_sources (curated poll list) ============
create table board_sources (
  id uuid primary key default gen_random_uuid(),
  ats_type text not null check (ats_type in ('greenhouse','lever','ashby','workable')),
  slug text not null,
  company_name text,
  active boolean not null default true,
  last_polled_at timestamptz,
  last_status text,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  unique (ats_type, slug)
);

-- ============ jobs ============
create table jobs (
  id uuid primary key default gen_random_uuid(),
  board_source_id uuid references board_sources(id) on delete set null,
  ats_type text not null check (ats_type in ('greenhouse','lever','ashby','workable')),
  external_id text not null,
  title text not null,
  company text not null,
  location text,
  description text,
  apply_url text not null,
  requires_login boolean not null default false,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  raw jsonb,
  embedding vector(1536),
  unique (ats_type, external_id)
);
create index jobs_embedding_idx on jobs using hnsw (embedding vector_cosine_ops);
create index jobs_open_idx on jobs (first_seen_at desc) where closed_at is null;

-- ============ job_matches ============
create table job_matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  score int not null check (score between 0 and 100),
  reason text,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index job_matches_user_score_idx on job_matches (user_id, score desc);

-- ============ applications ============
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id),
  mode text not null default 'auto' check (mode in ('assisted','auto')),
  status text not null default 'draft' check (status in
    ('draft','needs_review','approved','submitting','submitted','skipped','failed')),
  form_schema jsonb,
  resolved_fields jsonb not null default '{}',
  submitted_fields jsonb,
  cover_letter text,
  unresolved_fields jsonb not null default '[]',
  failure_reason text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (user_id, job_id)
);
create index applications_user_status_idx on applications (user_id, status);
create index applications_submitted_day_idx on applications (user_id, submitted_at);

-- ============ application_events (live feed) ============
create table application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  user_id uuid not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);
create index application_events_user_idx on application_events (user_id, created_at desc);

-- ============ subscriptions (Stripe columns added later) ============
create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  applications_used int not null default 0,
  applications_limit int not null default 10,
  period_start timestamptz not null default now(),
  period_end timestamptz not null default now() + interval '30 days'
);

-- ============ new-user seeding ============
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (user_id, email) values (new.id, new.email);
  insert into preferences (user_id) values (new.id);
  insert into subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ RLS ============
alter table profiles enable row level security;
alter table preferences enable row level security;
alter table board_sources enable row level security;
alter table jobs enable row level security;
alter table job_matches enable row level security;
alter table applications enable row level security;
alter table application_events enable row level security;
alter table subscriptions enable row level security;

create policy "own profile" on profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own preferences" on preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "jobs readable" on board_sources for select to authenticated using (true);
create policy "jobs readable2" on jobs for select to authenticated using (true);

create policy "own matches" on job_matches for select using (user_id = auth.uid());

create policy "own applications select" on applications
  for select using (user_id = auth.uid());
-- Users may edit resolved values only pre-approval; status transitions go
-- through API routes (service role).
create policy "own applications update" on applications
  for update using (user_id = auth.uid() and status in ('draft','needs_review'))
  with check (user_id = auth.uid() and status in ('draft','needs_review'));

create policy "own events" on application_events for select using (user_id = auth.uid());

create policy "own subscription" on subscriptions for select using (user_id = auth.uid());

-- ============ realtime for the live feed ============
alter publication supabase_realtime add table application_events;

-- ============ storage: private resumes bucket ============
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false);

create policy "own resume read" on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own resume write" on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own resume update" on storage.objects for update
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own resume delete" on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
