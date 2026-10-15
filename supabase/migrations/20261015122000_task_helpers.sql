create or replace function app.fail(p_code text, p_message text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = p_code,
    message = p_message,
    detail = coalesce(p_detail::text, '');
end;
$$;

create or replace function app.require_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    perform app.fail('MB401', 'not_authenticated');
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    perform app.fail('MB403', 'profile_missing');
  end if;
  return v_profile;
end;
$$;

create or replace function app.require_role(p_profile public.profiles, variadic p_roles public.user_role[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p_profile.role = any (p_roles)) then
    perform app.fail('MB403', 'forbidden');
  end if;
end;
$$;

create or replace function app.lock_task(p_profile public.profiles, p_task_id uuid, p_expected_version integer)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_crew uuid;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.division_id <> p_profile.division_id then
    perform app.fail('MB404', 'task_not_found');
  end if;
  if p_profile.role = 'foreman' then
    select id into v_crew from public.crews where foreman_id = p_profile.id;
    if v_crew is distinct from v_task.crew_id then
      perform app.fail('MB404', 'task_not_found');
    end if;
  end if;
  if p_expected_version is not null and v_task.version <> p_expected_version then
    perform app.fail('MB409', 'version_conflict', jsonb_build_object('current_version', v_task.version));
  end if;
  return v_task;
end;
$$;

create or replace function app.require_status(p_task public.tasks, variadic p_statuses public.task_status[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p_task.status = any (p_statuses)) then
    perform app.fail('MB423', 'invalid_status', jsonb_build_object('status', p_task.status));
  end if;
end;
$$;

create or replace function app.clean_text(p_value text, p_field text, p_min integer, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
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
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_value is not null and char_length(v_value) > p_max then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', p_field, 'max', p_max));
  end if;
  return v_value;
end;
$$;

create or replace function app.check_interval(p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_start is null or p_end is null then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'planned_start'));
  end if;
  if p_start >= p_end then
    perform app.fail('MB422', 'invalid_interval', jsonb_build_object('field', 'planned_end'));
  end if;
end;
$$;

create or replace function app.idempotent_response(p_client_key uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select k.response
  from app.idempotency_keys k
  where k.user_id = auth.uid() and k.client_key = p_client_key
$$;

create or replace function app.remember_response(p_client_key uuid, p_action text, p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_client_key is null then
    return p_response;
  end if;
  insert into app.idempotency_keys (user_id, client_key, action, response)
  values (auth.uid(), p_client_key, p_action, p_response);
  return p_response;
end;
$$;

create or replace function app.log_event(p_task_id uuid, p_profile public.profiles, p_kind text, p_data jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_events (task_id, actor_id, actor_role, kind, data)
  values (p_task_id, p_profile.id, p_profile.role, p_kind, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function app.bump(p_task_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.tasks
  set version = version + 1, updated_at = now()
  where id = p_task_id
  returning version
$$;

create or replace function app.crew_overlaps(p_crew_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_task uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'number', t.number,
        'title', t.title,
        'status', t.status,
        'planned_start', t.planned_start,
        'planned_end', t.planned_end
      )
      order by t.planned_start, t.number
    ),
    '[]'::jsonb
  )
  from public.tasks t
  where t.crew_id = p_crew_id
    and t.status not in ('Completed', 'Cancelled')
    and t.planned_start < p_end
    and t.planned_end > p_start
    and (p_exclude_task is null or t.id <> p_exclude_task)
$$;

create or replace function app.unacknowledged(p_overlaps jsonb, p_acknowledged uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(p_overlaps) o
    where not ((o ->> 'id')::uuid = any (coalesce(p_acknowledged, '{}'::uuid[])))
  )
$$;

create or replace function app.task_result(p_task_id uuid, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('result', 'ok', 'task_id', t.id, 'number', t.number, 'status', t.status, 'version', t.version)
    || coalesce(p_extra, '{}'::jsonb)
  from public.tasks t
  where t.id = p_task_id
$$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
