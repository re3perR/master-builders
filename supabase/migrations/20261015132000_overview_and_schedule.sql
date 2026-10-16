create or replace function public.division_counters()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where t.status in ('Assigned', 'Accepted', 'InProgress', 'InReview')),
    'overdue', count(*) filter (where t.status in ('Assigned', 'Accepted', 'InProgress') and t.planned_end < now()),
    'obstacles', count(*) filter (
      where exists (select 1 from public.task_obstacles o where o.task_id = t.id and o.closed_at is null)
    ),
    'review', count(*) filter (where t.status = 'InReview'),
    'statuses', jsonb_build_object(
      'Assigned', count(*) filter (where t.status = 'Assigned'),
      'Accepted', count(*) filter (where t.status = 'Accepted'),
      'InProgress', count(*) filter (where t.status = 'InProgress'),
      'InReview', count(*) filter (where t.status = 'InReview'),
      'Completed', count(*) filter (where t.status = 'Completed'),
      'Cancelled', count(*) filter (where t.status = 'Cancelled')
    )
  )
  from public.tasks t
$$;

create or replace function public.division_accepted_tasks(p_from timestamptz, p_to timestamptz)
returns table (
  task_id uuid,
  number integer,
  title text,
  crew_id uuid,
  crew_name text,
  report_id uuid,
  report_version integer,
  submitted_at timestamptz,
  decided_at timestamptz,
  planned_end_original timestamptz,
  planned_end timestamptz,
  on_time_original boolean,
  on_time_current boolean,
  review_seconds integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    t.number,
    t.title,
    t.crew_id,
    c.name,
    r.id,
    r.version,
    r.submitted_at,
    r.decided_at,
    t.planned_end_original,
    t.planned_end,
    r.submitted_at <= t.planned_end_original,
    r.submitted_at <= t.planned_end,
    extract(epoch from r.decided_at - r.submitted_at)::integer
  from public.tasks t
  join public.task_reports r on r.task_id = t.id and r.decision = 'accepted'
  left join public.crews c on c.id = t.crew_id
  where t.status = 'Completed'
    and r.decided_at >= p_from
    and r.decided_at < p_to
  order by r.decided_at desc, t.number desc
$$;

create or replace function public.division_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'accepted', count(*),
    'on_time_original', count(*) filter (where a.on_time_original),
    'on_time_current', count(*) filter (where a.on_time_current),
    'avg_review_seconds', round(avg(a.review_seconds))::integer
  )
  from public.division_accepted_tasks(p_from, p_to) a
$$;

create or replace function public.division_attention(p_limit integer default 5)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with overdue as (
    select
      t.id, t.number, t.title, t.status, t.priority, t.crew_id, c.name as crew_name, s.name as site_name,
      t.planned_start, t.planned_end, o.category as obstacle_category
    from public.tasks t
    left join public.crews c on c.id = t.crew_id
    left join public.sites s on s.id = t.site_id
    left join public.task_obstacles o on o.task_id = t.id and o.closed_at is null
    where t.status in ('Assigned', 'Accepted', 'InProgress')
      and t.planned_end < now()
    order by t.planned_end, t.number
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
  ),
  obstacles as (
    select
      t.id, t.number, t.title, t.status, t.priority, t.crew_id, c.name as crew_name, s.name as site_name,
      t.planned_start, t.planned_end, o.category, o.reason, o.opened_at
    from public.task_obstacles o
    join public.tasks t on t.id = o.task_id
    left join public.crews c on c.id = t.crew_id
    left join public.sites s on s.id = t.site_id
    where o.closed_at is null
    order by o.opened_at, t.number
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
  ),
  review as (
    select
      t.id, t.number, t.title, t.status, t.priority, t.crew_id, c.name as crew_name, s.name as site_name,
      t.planned_start, t.planned_end, r.version as report_version, r.submitted_at
    from public.tasks t
    join public.task_reports r on r.task_id = t.id and r.decision = 'pending'
    left join public.crews c on c.id = t.crew_id
    left join public.sites s on s.id = t.site_id
    where t.status = 'InReview'
    order by r.submitted_at, t.number
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
  )
  select jsonb_build_object(
    'overdue', coalesce((select jsonb_agg(to_jsonb(x) order by x.planned_end, x.number) from overdue x), '[]'::jsonb),
    'obstacles', coalesce((select jsonb_agg(to_jsonb(x) order by x.opened_at, x.number) from obstacles x), '[]'::jsonb),
    'review', coalesce((select jsonb_agg(to_jsonb(x) order by x.submitted_at, x.number) from review x), '[]'::jsonb)
  )
$$;

create or replace function public.schedule_tasks(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  number integer,
  title text,
  status public.task_status,
  priority public.task_priority,
  crew_id uuid,
  crew_name text,
  site_id uuid,
  site_name text,
  planned_start timestamptz,
  planned_end timestamptz,
  obstacle_category public.obstacle_category,
  overlapping jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    t.number,
    t.title,
    t.status,
    t.priority,
    t.crew_id,
    c.name,
    t.site_id,
    s.name,
    t.planned_start,
    t.planned_end,
    o.category,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'number', x.number,
            'title', x.title,
            'status', x.status,
            'planned_start', x.planned_start,
            'planned_end', x.planned_end
          )
          order by x.planned_start, x.number
        )
        from public.tasks x
        where t.status not in ('Completed', 'Cancelled')
          and x.crew_id = t.crew_id
          and x.id <> t.id
          and x.status not in ('Completed', 'Cancelled')
          and x.planned_start < t.planned_end
          and x.planned_end > t.planned_start
      ),
      '[]'::jsonb
    )
  from public.tasks t
  left join public.crews c on c.id = t.crew_id
  left join public.sites s on s.id = t.site_id
  left join public.task_obstacles o on o.task_id = t.id and o.closed_at is null
  where t.planned_start < p_to
    and t.planned_end > p_from
    and t.status <> 'Cancelled'
  order by t.planned_start, t.number
$$;

revoke all on function public.division_counters() from public, anon;
revoke all on function public.division_accepted_tasks(timestamptz, timestamptz) from public, anon;
revoke all on function public.division_metrics(timestamptz, timestamptz) from public, anon;
revoke all on function public.division_attention(integer) from public, anon;
revoke all on function public.schedule_tasks(timestamptz, timestamptz) from public, anon;

grant execute on function public.division_counters() to authenticated;
grant execute on function public.division_accepted_tasks(timestamptz, timestamptz) to authenticated;
grant execute on function public.division_metrics(timestamptz, timestamptz) to authenticated;
grant execute on function public.division_attention(integer) to authenticated;
grant execute on function public.schedule_tasks(timestamptz, timestamptz) to authenticated;
