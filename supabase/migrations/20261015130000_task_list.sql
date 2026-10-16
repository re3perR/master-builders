create index if not exists tasks_division_end_number_idx on public.tasks (division_id, planned_end, number);

create or replace view public.task_list
with (security_invoker = true)
as
select
  t.id,
  t.company_id,
  t.division_id,
  t.number,
  t.title,
  t.site_id,
  s.name as site_name,
  t.crew_id,
  c.name as crew_name,
  t.priority,
  t.status,
  t.address_snapshot,
  t.planned_start,
  t.planned_end,
  t.planned_start_original,
  t.planned_end_original,
  t.accepted_at,
  t.started_at,
  t.submitted_at,
  t.completed_at,
  t.cancelled_at,
  t.source_task_id,
  t.terms_changed_at,
  t.created_by,
  t.created_at,
  t.updated_at,
  t.version,
  t.status in ('Assigned', 'Accepted', 'InProgress') and t.planned_end < now() as is_overdue,
  o.id is not null as has_open_obstacle,
  o.category as obstacle_category,
  o.reason as obstacle_reason,
  o.opened_at as obstacle_opened_at,
  r.submitted_at as pending_submitted_at,
  translate(lower(concat_ws(' ', t.title, s.name, t.address_snapshot)), 'ё', 'е') as search_text
from public.tasks t
left join public.sites s on s.id = t.site_id
left join public.crews c on c.id = t.crew_id
left join public.task_obstacles o on o.task_id = t.id and o.closed_at is null
left join public.task_reports r on r.task_id = t.id and r.decision = 'pending';

revoke all on public.task_list from public, anon, authenticated;
grant select on public.task_list to authenticated, service_role;
