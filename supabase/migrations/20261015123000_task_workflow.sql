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
  where id = p_site_id and division_id = v_profile.division_id;
  if not found then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'site_id'));
  end if;
  if v_site.archived_at is not null then
    perform app.fail('MB422', 'archived_reference', jsonb_build_object('field', 'site_id'));
  end if;

  select * into v_crew from public.crews
  where id = p_crew_id and division_id = v_profile.division_id;
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

  perform 1 from public.crews where id = v_crew.id for update;

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
    'overlaps_acknowledged', v_overlaps
  ));

  return app.remember_response(p_client_key, 'create_task', app.task_result(v_task_id));
end;
$$;

create or replace function public.update_task_details(
  p_task_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_address_snapshot text,
  p_access_note_snapshot text,
  p_client_key uuid
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
  v_title text;
  v_description text;
  v_address text;
  v_access text;
  v_changes jsonb := '{}'::jsonb;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned', 'Accepted', 'InProgress');

  v_title := app.clean_text(p_title, 'title', 3, 160);
  v_description := app.clean_text(p_description, 'description', 10, 5000);
  v_address := app.clean_text(p_address_snapshot, 'address_snapshot', 5, 300);
  v_access := app.optional_text(p_access_note_snapshot, 'access_note_snapshot', 2000);

  if v_title <> v_task.title then
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', v_task.title, 'new', v_title));
  end if;
  if v_description <> v_task.description then
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', v_task.description, 'new', v_description));
  end if;
  if coalesce(p_priority, v_task.priority) <> v_task.priority then
    v_changes := v_changes || jsonb_build_object('priority', jsonb_build_object('old', v_task.priority, 'new', p_priority));
  end if;
  if v_address <> v_task.address_snapshot then
    v_changes := v_changes || jsonb_build_object('address_snapshot', jsonb_build_object('old', v_task.address_snapshot, 'new', v_address));
  end if;
  if v_access is distinct from v_task.access_note_snapshot then
    v_changes := v_changes || jsonb_build_object('access_note_snapshot', jsonb_build_object('old', v_task.access_note_snapshot, 'new', v_access));
  end if;

  if v_changes = '{}'::jsonb then
    return app.remember_response(p_client_key, 'update_task_details', app.task_result(v_task.id, jsonb_build_object('changed', false)));
  end if;

  update public.tasks
  set title = v_title,
      description = v_description,
      priority = coalesce(p_priority, priority),
      address_snapshot = v_address,
      access_note_snapshot = v_access,
      terms_changed_at = case when v_task.status <> 'Assigned' then now() else terms_changed_at end
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'details_changed', jsonb_build_object(
    'changes', v_changes,
    'after_acceptance', v_task.status <> 'Assigned'
  ));

  return app.remember_response(p_client_key, 'update_task_details', app.task_result(v_task.id, jsonb_build_object('changed', true)));
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
    'overlaps_acknowledged', v_overlaps
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
      accepted_at = null
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'reassigned', jsonb_build_object(
    'reason', v_reason,
    'old', jsonb_build_object('crew_id', v_old_crew.id, 'crew_name', v_old_crew.name, 'status', v_task.status),
    'new', jsonb_build_object('crew_id', v_new_crew.id, 'crew_name', v_new_crew.name, 'status', 'Assigned'),
    'overlaps_acknowledged', v_overlaps
  ));

  return app.remember_response(p_client_key, 'reassign_task', app.task_result(v_task.id));
end;
$$;

create or replace function public.cancel_task(
  p_task_id uuid,
  p_expected_version integer,
  p_reason text,
  p_client_key uuid
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
  v_obstacle uuid;
  v_report uuid;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned', 'Accepted', 'InProgress', 'InReview');
  v_reason := app.clean_text(p_reason, 'reason', 3, 1000);

  update public.task_obstacles
  set closed_at = now(),
      closed_by = v_profile.id,
      closed_by_system = true,
      close_comment = 'Задание отменено: ' || v_reason
  where task_id = v_task.id and closed_at is null
  returning id into v_obstacle;

  if v_obstacle is not null then
    perform app.log_event(v_task.id, v_profile, 'obstacle_closed', jsonb_build_object(
      'obstacle_id', v_obstacle,
      'comment', 'Задание отменено: ' || v_reason,
      'system', true
    ));
  end if;

  update public.task_reports
  set decision = 'cancelled',
      decided_by = v_profile.id,
      decided_at = now(),
      decision_note = v_reason
  where task_id = v_task.id and decision = 'pending'
  returning id into v_report;

  update public.tasks
  set status = 'Cancelled',
      cancelled_at = now(),
      cancelled_by = v_profile.id,
      cancel_reason = v_reason
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'cancelled', jsonb_build_object(
    'reason', v_reason,
    'old_status', v_task.status,
    'pending_report_id', v_report
  ));

  return app.remember_response(p_client_key, 'cancel_task', app.task_result(v_task.id));
end;
$$;

create or replace function public.accept_task(p_task_id uuid, p_expected_version integer, p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_task public.tasks;
  v_saved jsonb;
begin
  perform app.require_role(v_profile, 'foreman');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned');

  update public.tasks set status = 'Accepted', accepted_at = now() where id = v_task.id;
  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'status_changed', jsonb_build_object('old', 'Assigned', 'new', 'Accepted'));

  return app.remember_response(p_client_key, 'accept_task', app.task_result(v_task.id));
end;
$$;

create or replace function public.start_task(p_task_id uuid, p_expected_version integer, p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_task public.tasks;
  v_saved jsonb;
begin
  perform app.require_role(v_profile, 'foreman');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Accepted');

  update public.tasks set status = 'InProgress', started_at = coalesce(started_at, now()) where id = v_task.id;
  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'status_changed', jsonb_build_object('old', 'Accepted', 'new', 'InProgress'));

  return app.remember_response(p_client_key, 'start_task', app.task_result(v_task.id));
end;
$$;

create or replace function public.open_obstacle(
  p_task_id uuid,
  p_expected_version integer,
  p_category public.obstacle_category,
  p_reason text,
  p_client_key uuid
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
  v_obstacle uuid;
begin
  perform app.require_role(v_profile, 'foreman');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned', 'Accepted', 'InProgress');
  v_reason := app.clean_text(p_reason, 'reason', 3, 2000);

  if p_category is null then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'category'));
  end if;
  if exists (select 1 from public.task_obstacles where task_id = v_task.id and closed_at is null) then
    perform app.fail('MB423', 'obstacle_open');
  end if;

  insert into public.task_obstacles (task_id, category, reason, opened_by)
  values (v_task.id, p_category, v_reason, v_profile.id)
  returning id into v_obstacle;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'obstacle_opened', jsonb_build_object(
    'obstacle_id', v_obstacle,
    'category', p_category,
    'reason', v_reason
  ));

  return app.remember_response(p_client_key, 'open_obstacle', app.task_result(v_task.id, jsonb_build_object('obstacle_id', v_obstacle)));
end;
$$;

create or replace function public.close_obstacle(
  p_task_id uuid,
  p_expected_version integer,
  p_comment text,
  p_client_key uuid
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
  v_comment text;
  v_obstacle public.task_obstacles;
begin
  perform app.require_role(v_profile, 'dispatcher', 'foreman');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'Assigned', 'Accepted', 'InProgress');
  v_comment := app.clean_text(p_comment, 'comment', 3, 2000);

  update public.task_obstacles
  set closed_at = now(), closed_by = v_profile.id, close_comment = v_comment
  where task_id = v_task.id and closed_at is null
  returning * into v_obstacle;

  if v_obstacle.id is null then
    perform app.fail('MB423', 'obstacle_not_open');
  end if;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'obstacle_closed', jsonb_build_object(
    'obstacle_id', v_obstacle.id,
    'category', v_obstacle.category,
    'comment', v_comment,
    'duration_seconds', extract(epoch from v_obstacle.closed_at - v_obstacle.opened_at)::bigint,
    'system', false
  ));

  return app.remember_response(p_client_key, 'close_obstacle', app.task_result(v_task.id));
end;
$$;

create or replace function public.post_message(p_task_id uuid, p_body text, p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_task public.tasks;
  v_body text;
  v_message public.task_messages;
begin
  perform app.require_role(v_profile, 'dispatcher', 'foreman');
  if p_client_key is null then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'client_key'));
  end if;

  select * into v_message from public.task_messages
  where author_id = v_profile.id and client_key = p_client_key;
  if found then
    return jsonb_build_object('result', 'ok', 'message_id', v_message.id, 'created_at', v_message.created_at);
  end if;

  v_task := app.lock_task(v_profile, p_task_id, null);
  perform app.require_status(v_task, 'Assigned', 'Accepted', 'InProgress', 'InReview');
  v_body := app.clean_text(p_body, 'body', 1, 3000);

  insert into public.task_messages (task_id, author_id, author_role, body, client_key)
  values (v_task.id, v_profile.id, v_profile.role, v_body, p_client_key)
  on conflict (author_id, client_key) do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message from public.task_messages
    where author_id = v_profile.id and client_key = p_client_key;
  end if;

  return jsonb_build_object('result', 'ok', 'message_id', v_message.id, 'created_at', v_message.created_at);
end;
$$;

revoke all on function public.create_task(text, text, uuid, uuid, public.task_priority, timestamptz, timestamptz, uuid, uuid[], uuid) from public, anon;
revoke all on function public.update_task_details(uuid, integer, text, text, public.task_priority, text, text, uuid) from public, anon;
revoke all on function public.reschedule_task(uuid, integer, timestamptz, timestamptz, text, uuid, uuid[]) from public, anon;
revoke all on function public.reassign_task(uuid, integer, uuid, text, uuid, uuid[]) from public, anon;
revoke all on function public.cancel_task(uuid, integer, text, uuid) from public, anon;
revoke all on function public.accept_task(uuid, integer, uuid) from public, anon;
revoke all on function public.start_task(uuid, integer, uuid) from public, anon;
revoke all on function public.open_obstacle(uuid, integer, public.obstacle_category, text, uuid) from public, anon;
revoke all on function public.close_obstacle(uuid, integer, text, uuid) from public, anon;
revoke all on function public.post_message(uuid, text, uuid) from public, anon;

grant execute on function public.create_task(text, text, uuid, uuid, public.task_priority, timestamptz, timestamptz, uuid, uuid[], uuid) to authenticated;
grant execute on function public.update_task_details(uuid, integer, text, text, public.task_priority, text, text, uuid) to authenticated;
grant execute on function public.reschedule_task(uuid, integer, timestamptz, timestamptz, text, uuid, uuid[]) to authenticated;
grant execute on function public.reassign_task(uuid, integer, uuid, text, uuid, uuid[]) to authenticated;
grant execute on function public.cancel_task(uuid, integer, text, uuid) to authenticated;
grant execute on function public.accept_task(uuid, integer, uuid) to authenticated;
grant execute on function public.start_task(uuid, integer, uuid) to authenticated;
grant execute on function public.open_obstacle(uuid, integer, public.obstacle_category, text, uuid) to authenticated;
grant execute on function public.close_obstacle(uuid, integer, text, uuid) to authenticated;
grant execute on function public.post_message(uuid, text, uuid) to authenticated;
