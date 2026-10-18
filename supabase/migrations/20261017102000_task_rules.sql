create or replace function app.trim_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    coalesce(p_value, ''),
    E' \t\n\r\u000b\f                 　﻿'
  )
$$;

create or replace function app.clean_text(p_value text, p_field text, p_min integer, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := app.trim_text(p_value);
begin
  if char_length(v_value) < p_min or char_length(v_value) > p_max then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', p_field, 'min', p_min, 'max', p_max));
  end if;
  return v_value;
end;
$$;

create or replace function app.optional_text(p_value text, p_field text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := nullif(app.trim_text(p_value), '');
begin
  if v_value is not null and char_length(v_value) > p_max then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', p_field, 'max', p_max));
  end if;
  return v_value;
end;
$$;

create or replace function app.idempotent_response(p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_client_key is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_key::text, 0));
  return (
    select k.response
    from app.idempotency_keys k
    where k.user_id = auth.uid() and k.client_key = p_client_key
  );
end;
$$;

create or replace function app.overlap_refs(p_overlaps jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o -> 'id', 'number', o -> 'number')), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_overlaps, '[]'::jsonb)) o
$$;

revoke all on function app.trim_text(text) from public, anon;
revoke all on function app.overlap_refs(jsonb) from public, anon;
grant execute on function app.trim_text(text) to authenticated, service_role;
grant execute on function app.overlap_refs(jsonb) to authenticated, service_role;

create or replace function public.create_task(
  p_title text,
  p_description text,
  p_site_id uuid,
  p_crew_id uuid,
  p_priority public.task_priority,
  p_planned_start timestamptz,
  p_planned_end timestamptz,
  p_client_key uuid,
  p_acknowledged_overlaps uuid[] default '{}',
  p_source_task_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_title text;
  v_description text;
  v_site public.sites;
  v_crew public.crews;
  v_overlaps jsonb;
  v_number integer;
  v_task_id uuid;
  v_saved jsonb;
begin
  perform app.require_role(v_profile, 'dispatcher');

  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;

  v_title := app.clean_text(p_title, 'title', 3, 160);
  v_description := app.clean_text(p_description, 'description', 10, 5000);
  perform app.check_interval(p_planned_start, p_planned_end);

  select * into v_site from public.sites
  where id = p_site_id and division_id = v_profile.division_id
  for share;
  if not found then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'site_id'));
  end if;
  if v_site.archived_at is not null then
    perform app.fail('MB422', 'archived_reference', jsonb_build_object('field', 'site_id'));
  end if;

  select * into v_crew from public.crews
  where id = p_crew_id and division_id = v_profile.division_id
  for update;
  if not found then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'crew_id'));
  end if;
  if v_crew.archived_at is not null then
    perform app.fail('MB422', 'archived_reference', jsonb_build_object('field', 'crew_id'));
  end if;

  if p_source_task_id is not null and not exists (
    select 1 from public.tasks where id = p_source_task_id and division_id = v_profile.division_id
  ) then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'source_task_id'));
  end if;

  v_overlaps := app.crew_overlaps(v_crew.id, p_planned_start, p_planned_end);
  if app.unacknowledged(v_overlaps, p_acknowledged_overlaps) then
    return jsonb_build_object('result', 'overlaps', 'overlaps', v_overlaps);
  end if;

  update public.companies
  set next_task_number = next_task_number + 1
  where id = v_profile.company_id
  returning next_task_number - 1 into v_number;

  insert into public.tasks (
    company_id, division_id, number, title, description, site_id, crew_id, priority,
    address_snapshot, access_note_snapshot,
    planned_start_original, planned_end_original, planned_start, planned_end,
    source_task_id, created_by
  )
  values (
    v_profile.company_id, v_profile.division_id, v_number, v_title, v_description, v_site.id, v_crew.id,
    coalesce(p_priority, 'normal'),
    v_site.address, v_site.access_note,
    p_planned_start, p_planned_end, p_planned_start, p_planned_end,
    p_source_task_id, v_profile.id
  )
  returning id into v_task_id;

  perform app.log_event(v_task_id, v_profile, 'created', jsonb_build_object(
    'title', v_title,
    'site_id', v_site.id,
    'site_name', v_site.name,
    'crew_id', v_crew.id,
    'crew_name', v_crew.name,
    'priority', coalesce(p_priority, 'normal'),
    'planned_start', p_planned_start,
    'planned_end', p_planned_end,
    'source_task_id', p_source_task_id,
    'overlaps_acknowledged', app.overlap_refs(v_overlaps)
  ));

  return app.remember_response(p_client_key, 'create_task', app.task_result(v_task_id));
end;
$$;

create or replace function public.reschedule_task(
  p_task_id uuid,
  p_expected_version integer,
  p_planned_start timestamptz,
  p_planned_end timestamptz,
  p_reason text,
  p_client_key uuid,
  p_acknowledged_overlaps uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_task public.tasks;
  v_saved jsonb;
  v_reason text;
  v_overlaps jsonb;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned', 'Accepted', 'InProgress');
  perform app.check_interval(p_planned_start, p_planned_end);
  v_reason := app.clean_text(p_reason, 'reason', 3, 1000);

  if p_planned_start = v_task.planned_start and p_planned_end = v_task.planned_end then
    perform app.fail('MB422', 'nothing_changed', jsonb_build_object('field', 'planned_start'));
  end if;

  perform 1 from public.crews where id = v_task.crew_id for update;
  v_overlaps := app.crew_overlaps(v_task.crew_id, p_planned_start, p_planned_end, v_task.id);
  if app.unacknowledged(v_overlaps, p_acknowledged_overlaps) then
    return jsonb_build_object('result', 'overlaps', 'overlaps', v_overlaps);
  end if;

  update public.tasks
  set planned_start = p_planned_start,
      planned_end = p_planned_end,
      terms_changed_at = case when v_task.status <> 'Assigned' then now() else terms_changed_at end
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'rescheduled', jsonb_build_object(
    'reason', v_reason,
    'old', jsonb_build_object('planned_start', v_task.planned_start, 'planned_end', v_task.planned_end),
    'new', jsonb_build_object('planned_start', p_planned_start, 'planned_end', p_planned_end),
    'overlaps_acknowledged', app.overlap_refs(v_overlaps)
  ));

  return app.remember_response(p_client_key, 'reschedule_task', app.task_result(v_task.id));
end;
$$;

create or replace function public.reassign_task(
  p_task_id uuid,
  p_expected_version integer,
  p_crew_id uuid,
  p_reason text,
  p_client_key uuid,
  p_acknowledged_overlaps uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_task public.tasks;
  v_saved jsonb;
  v_reason text;
  v_old_crew public.crews;
  v_new_crew public.crews;
  v_overlaps jsonb;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned', 'Accepted');
  v_reason := app.clean_text(p_reason, 'reason', 3, 1000);

  if exists (select 1 from public.task_obstacles where task_id = v_task.id and closed_at is null) then
    perform app.fail('MB423', 'obstacle_open');
  end if;

  select * into v_new_crew from public.crews
  where id = p_crew_id and division_id = v_profile.division_id
  for update;
  if not found then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'crew_id'));
  end if;
  if v_new_crew.archived_at is not null then
    perform app.fail('MB422', 'archived_reference', jsonb_build_object('field', 'crew_id'));
  end if;
  if v_new_crew.id = v_task.crew_id then
    perform app.fail('MB422', 'nothing_changed', jsonb_build_object('field', 'crew_id'));
  end if;

  select * into v_old_crew from public.crews where id = v_task.crew_id;

  v_overlaps := app.crew_overlaps(v_new_crew.id, v_task.planned_start, v_task.planned_end, v_task.id);
  if app.unacknowledged(v_overlaps, p_acknowledged_overlaps) then
    return jsonb_build_object('result', 'overlaps', 'overlaps', v_overlaps);
  end if;

  update public.tasks
  set crew_id = v_new_crew.id,
      status = 'Assigned',
      accepted_at = null,
      terms_changed_at = null
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'reassigned', jsonb_build_object(
    'reason', v_reason,
    'old', jsonb_build_object('crew_id', v_old_crew.id, 'crew_name', v_old_crew.name, 'status', v_task.status),
    'new', jsonb_build_object('crew_id', v_new_crew.id, 'crew_name', v_new_crew.name, 'status', 'Assigned'),
    'overlaps_acknowledged', app.overlap_refs(v_overlaps)
  ));

  return app.remember_response(p_client_key, 'reassign_task', app.task_result(v_task.id));
end;
$$;

revoke all on function public.create_task(text, text, uuid, uuid, public.task_priority, timestamptz, timestamptz, uuid, uuid[], uuid) from public, anon;
revoke all on function public.reschedule_task(uuid, integer, timestamptz, timestamptz, text, uuid, uuid[]) from public, anon;
revoke all on function public.reassign_task(uuid, integer, uuid, text, uuid, uuid[]) from public, anon;

grant execute on function public.create_task(text, text, uuid, uuid, public.task_priority, timestamptz, timestamptz, uuid, uuid[], uuid) to authenticated;
grant execute on function public.reschedule_task(uuid, integer, timestamptz, timestamptz, text, uuid, uuid[]) to authenticated;
grant execute on function public.reassign_task(uuid, integer, uuid, text, uuid, uuid[]) to authenticated;

update public.task_events
set data = jsonb_set(data, '{overlaps_acknowledged}', app.overlap_refs(data -> 'overlaps_acknowledged'))
where data @? '$.overlaps_acknowledged[*].title';

update public.tasks
set terms_changed_at = null
where terms_changed_at is not null and (accepted_at is null or terms_changed_at < accepted_at);
