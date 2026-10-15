create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create type public.user_role as enum ('dispatcher', 'foreman', 'manager');
create type public.task_status as enum ('Assigned', 'Accepted', 'InProgress', 'InReview', 'Completed', 'Cancelled');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.obstacle_category as enum ('access', 'materials', 'equipment', 'other');
create type public.report_decision as enum ('pending', 'accepted', 'returned', 'cancelled');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  timezone text not null default 'Europe/Moscow',
  next_task_number integer not null default 1 check (next_task_number > 0),
  created_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null,
  division_id uuid not null,
  role public.user_role not null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  created_at timestamptz not null default now(),
  foreign key (division_id, company_id) references public.divisions (id, company_id),
  unique (id, division_id)
);

create index profiles_division_idx on public.profiles (division_id);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  division_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  foreman_id uuid not null unique,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (division_id, company_id) references public.divisions (id, company_id),
  foreign key (foreman_id, division_id) references public.profiles (id, division_id),
  unique (id, division_id)
);

create index crews_division_idx on public.crews (division_id);

create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index crew_members_crew_idx on public.crew_members (crew_id, position);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  division_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  address text not null check (char_length(btrim(address)) between 5 and 300),
  access_note text check (access_note is null or char_length(access_note) <= 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (division_id, company_id) references public.divisions (id, company_id),
  unique (id, division_id)
);

create index sites_division_idx on public.sites (division_id, name);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  division_id uuid not null,
  number integer not null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null check (char_length(btrim(description)) between 10 and 5000),
  site_id uuid not null,
  crew_id uuid not null,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'Assigned',
  address_snapshot text not null,
  access_note_snapshot text,
  planned_start_original timestamptz not null,
  planned_end_original timestamptz not null,
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  accepted_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancel_reason text,
  source_task_id uuid references public.tasks (id),
  terms_changed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (division_id, company_id) references public.divisions (id, company_id),
  foreign key (site_id, division_id) references public.sites (id, division_id),
  foreign key (crew_id, division_id) references public.crews (id, division_id),
  unique (company_id, number),
  check (planned_start < planned_end),
  check (planned_start_original < planned_end_original),
  check (
    (status = 'Cancelled') = (cancelled_at is not null)
    and (status <> 'Cancelled' or (cancel_reason is not null and cancelled_by is not null))
  ),
  check ((status = 'Completed') = (completed_at is not null))
);

create index tasks_division_end_idx on public.tasks (division_id, planned_end, id);
create index tasks_division_status_idx on public.tasks (division_id, status);
create index tasks_crew_interval_idx on public.tasks (crew_id, planned_start, planned_end);
create index tasks_site_idx on public.tasks (site_id);
create index tasks_source_idx on public.tasks (source_task_id) where source_task_id is not null;

create table public.task_obstacles (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  category public.obstacle_category not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  close_comment text,
  closed_by_system boolean not null default false,
  check ((closed_at is null) = (close_comment is null))
);

create unique index task_obstacles_one_open_idx on public.task_obstacles (task_id) where closed_at is null;
create index task_obstacles_task_idx on public.task_obstacles (task_id, opened_at);

create table public.task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_role public.user_role not null,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  client_key uuid not null,
  created_at timestamptz not null default now(),
  unique (author_id, client_key)
);

create index task_messages_task_idx on public.task_messages (task_id, created_at, id);

create table public.task_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  version integer not null check (version > 0),
  comment text not null check (char_length(btrim(comment)) between 10 and 3000),
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  decision public.report_decision not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  client_key uuid not null,
  unique (task_id, version),
  unique (submitted_by, client_key),
  check (decision <> 'returned' or char_length(btrim(coalesce(decision_note, ''))) >= 3),
  check ((decision = 'pending') = (decided_at is null))
);

create unique index task_reports_one_pending_idx on public.task_reports (task_id) where decision = 'pending';

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width integer check (width > 0),
  height integer check (height > 0),
  report_id uuid references public.task_reports (id),
  position integer,
  created_at timestamptz not null default now()
);

create index uploads_report_idx on public.uploads (report_id, position);
create index uploads_staged_idx on public.uploads (created_at) where report_id is null;

create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  actor_role public.user_role,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index task_events_task_idx on public.task_events (task_id, id);

create table app.idempotency_keys (
  user_id uuid not null,
  client_key uuid not null,
  action text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_key)
);
