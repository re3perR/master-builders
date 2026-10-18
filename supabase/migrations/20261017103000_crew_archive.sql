create or replace function public.archive_crew(p_crew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
  v_active integer;
  v_changed boolean;
begin
  select * into v_crew from public.crews where id = p_crew_id for update;
  if not found then
    perform app.fail('MB404', 'crew_not_found');
  end if;

  v_changed := v_crew.archived_at is null;
  if v_changed then
    select count(*) into v_active
    from public.tasks
    where crew_id = v_crew.id and status in ('Assigned', 'Accepted', 'InProgress', 'InReview');

    if v_active > 0 then
      perform app.fail('MB423', 'active_tasks', jsonb_build_object('active_tasks', v_active));
    end if;

    update public.crews
    set archived_at = now(), updated_at = now()
    where id = v_crew.id
    returning * into v_crew;
  end if;

  return jsonb_build_object(
    'result', 'ok',
    'crew_id', v_crew.id,
    'changed', v_changed,
    'archived_at', v_crew.archived_at,
    'updated_at', v_crew.updated_at
  );
end;
$$;

create or replace function public.restore_crew(p_crew_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
  v_changed boolean;
begin
  select * into v_crew from public.crews where id = p_crew_id for update;
  if not found then
    perform app.fail('MB404', 'crew_not_found');
  end if;

  v_changed := v_crew.archived_at is not null;
  if v_changed then
    update public.crews
    set archived_at = null, updated_at = now()
    where id = v_crew.id
    returning * into v_crew;
  end if;

  return jsonb_build_object(
    'result', 'ok',
    'crew_id', v_crew.id,
    'changed', v_changed,
    'archived_at', v_crew.archived_at,
    'updated_at', v_crew.updated_at
  );
end;
$$;

revoke all on function public.archive_crew(uuid) from public, anon, authenticated;
revoke all on function public.restore_crew(uuid) from public, anon, authenticated;

grant execute on function public.archive_crew(uuid) to service_role;
grant execute on function public.restore_crew(uuid) to service_role;
