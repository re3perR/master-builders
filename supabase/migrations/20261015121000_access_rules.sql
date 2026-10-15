create or replace function app.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid()
$$;

create or replace function app.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function app.current_division()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.division_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function app.current_crew()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.crews c
  join public.profiles p on p.id = c.foreman_id
  where p.id = auth.uid() and p.role = 'foreman'
$$;

create or replace function app.can_read_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    join public.profiles p on p.id = auth.uid() and p.division_id = t.division_id
    where t.id = p_task_id
      and (
        p.role in ('dispatcher', 'manager')
        or (p.role = 'foreman' and t.crew_id = (select c.id from public.crews c where c.foreman_id = p.id))
      )
  )
$$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

alter table public.companies enable row level security;
alter table public.divisions enable row level security;
alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.sites enable row level security;
alter table public.tasks enable row level security;
alter table public.task_obstacles enable row level security;
alter table public.task_messages enable row level security;
alter table public.task_reports enable row level security;
alter table public.uploads enable row level security;
alter table public.task_events enable row level security;
alter table app.idempotency_keys enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
revoke all on app.idempotency_keys from public, anon, authenticated;

create policy companies_read on public.companies
  for select to authenticated
  using (id = (select p.company_id from app.current_profile() p));

create policy divisions_read on public.divisions
  for select to authenticated
  using (id = (select app.current_division()));

create policy profiles_read on public.profiles
  for select to authenticated
  using (division_id = (select app.current_division()));

create policy crews_read on public.crews
  for select to authenticated
  using (
    division_id = (select app.current_division())
    and ((select app.current_role()) <> 'foreman' or id = (select app.current_crew()))
  );

create policy crew_members_read on public.crew_members
  for select to authenticated
  using (
    exists (
      select 1 from public.crews c
      where c.id = crew_members.crew_id
        and c.division_id = (select app.current_division())
        and ((select app.current_role()) <> 'foreman' or c.id = (select app.current_crew()))
    )
  );

create policy sites_read on public.sites
  for select to authenticated
  using (
    division_id = (select app.current_division())
    and (
      (select app.current_role()) <> 'foreman'
      or exists (
        select 1 from public.tasks t
        where t.site_id = sites.id and t.crew_id = (select app.current_crew())
      )
    )
  );

create policy tasks_read on public.tasks
  for select to authenticated
  using (
    division_id = (select app.current_division())
    and ((select app.current_role()) <> 'foreman' or crew_id = (select app.current_crew()))
  );

create policy task_obstacles_read on public.task_obstacles
  for select to authenticated
  using (app.can_read_task(task_id));

create policy task_messages_read on public.task_messages
  for select to authenticated
  using (app.can_read_task(task_id));

create policy task_reports_read on public.task_reports
  for select to authenticated
  using (app.can_read_task(task_id));

create policy uploads_read on public.uploads
  for select to authenticated
  using (
    app.can_read_task(task_id)
    and (report_id is not null or uploaded_by = auth.uid())
  );

create policy task_events_read on public.task_events
  for select to authenticated
  using (app.can_read_task(task_id));
