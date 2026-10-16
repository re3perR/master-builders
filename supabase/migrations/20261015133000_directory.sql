create or replace function app.lock_site(p_profile public.profiles, p_site_id uuid)
returns public.sites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites;
begin
  select * into v_site
  from public.sites
  where id = p_site_id and division_id = p_profile.division_id
  for update;
  if not found then
    perform app.fail('MB404', 'site_not_found');
  end if;
  return v_site;
end;
$$;

create or replace function app.lock_crew(p_profile public.profiles, p_crew_id uuid)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
begin
  select * into v_crew
  from public.crews
  where id = p_crew_id and division_id = p_profile.division_id
  for update;
  if not found then
    perform app.fail('MB404', 'crew_not_found');
  end if;
  return v_crew;
end;
$$;

revoke all on function app.lock_site(public.profiles, uuid) from public, anon;
revoke all on function app.lock_crew(public.profiles, uuid) from public, anon;
grant execute on function app.lock_site(public.profiles, uuid) to authenticated, service_role;
grant execute on function app.lock_crew(public.profiles, uuid) to authenticated, service_role;

create or replace function public.create_site(
  p_name text,
  p_address text,
  p_access_note text,
  p_contact text,
  p_client_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_saved jsonb;
  v_name text;
  v_address text;
  v_access text;
  v_contact text;
  v_site public.sites;
begin
  perform app.require_role(v_profile, 'dispatcher');
  if p_client_key is null then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'client_key'));
  end if;

  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;

  v_name := app.clean_text(p_name, 'name', 2, 160);
  v_address := app.clean_text(p_address, 'address', 5, 300);
  v_access := app.optional_text(p_access_note, 'access_note', 2000);
  v_contact := app.optional_text(p_contact, 'contact', 200);

  insert into public.sites (company_id, division_id, name, address, access_note, contact, created_by)
  values (v_profile.company_id, v_profile.division_id, v_name, v_address, v_access, v_contact, v_profile.id)
  returning * into v_site;

  return app.remember_response(p_client_key, 'create_site', jsonb_build_object(
    'result', 'ok',
    'site_id', v_site.id,
    'changed', true,
    'updated_at', v_site.updated_at
  ));
end;
$$;

create or replace function public.update_site(
  p_site_id uuid,
  p_name text,
  p_address text,
  p_access_note text,
  p_contact text,
  p_client_key uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_site public.sites;
  v_saved jsonb;
  v_name text;
  v_address text;
  v_access text;
  v_contact text;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_site := app.lock_site(v_profile, p_site_id);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;

  if p_expected_updated_at is not null and v_site.updated_at <> p_expected_updated_at then
    perform app.fail('MB409', 'version_conflict', jsonb_build_object('updated_at', v_site.updated_at));
  end if;
  if v_site.archived_at is not null then
    perform app.fail('MB423', 'site_archived');
  end if;

  v_name := app.clean_text(p_name, 'name', 2, 160);
  v_address := app.clean_text(p_address, 'address', 5, 300);
  v_access := app.optional_text(p_access_note, 'access_note', 2000);
  v_contact := app.optional_text(p_contact, 'contact', 200);

  if v_name = v_site.name
    and v_address = v_site.address
    and v_access is not distinct from v_site.access_note
    and v_contact is not distinct from v_site.contact
  then
    return app.remember_response(p_client_key, 'update_site', jsonb_build_object(
      'result', 'ok',
      'site_id', v_site.id,
      'changed', false,
      'updated_at', v_site.updated_at
    ));
  end if;

  update public.sites
  set name = v_name,
      address = v_address,
      access_note = v_access,
      contact = v_contact,
      updated_at = now()
  where id = v_site.id
  returning * into v_site;

  return app.remember_response(p_client_key, 'update_site', jsonb_build_object(
    'result', 'ok',
    'site_id', v_site.id,
    'changed', true,
    'updated_at', v_site.updated_at
  ));
end;
$$;

create or replace function public.archive_site(p_site_id uuid, p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_site public.sites;
  v_saved jsonb;
  v_active integer;
  v_changed boolean;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_site := app.lock_site(v_profile, p_site_id);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;

  v_changed := v_site.archived_at is null;
  if v_changed then
    select count(*) into v_active
    from public.tasks
    where site_id = v_site.id and status in ('Assigned', 'Accepted', 'InProgress', 'InReview');

    if v_active > 0 then
      perform app.fail('MB423', 'active_tasks', jsonb_build_object('active_tasks', v_active));
    end if;

    update public.sites
    set archived_at = now(), updated_at = now()
    where id = v_site.id
    returning * into v_site;
  end if;

  return app.remember_response(p_client_key, 'archive_site', jsonb_build_object(
    'result', 'ok',
    'site_id', v_site.id,
    'changed', v_changed,
    'archived_at', v_site.archived_at,
    'updated_at', v_site.updated_at
  ));
end;
$$;

create or replace function public.restore_site(p_site_id uuid, p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_site public.sites;
  v_saved jsonb;
  v_changed boolean;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_site := app.lock_site(v_profile, p_site_id);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;

  v_changed := v_site.archived_at is not null;
  if v_changed then
    update public.sites
    set archived_at = null, updated_at = now()
    where id = v_site.id
    returning * into v_site;
  end if;

  return app.remember_response(p_client_key, 'restore_site', jsonb_build_object(
    'result', 'ok',
    'site_id', v_site.id,
    'changed', v_changed,
    'archived_at', v_site.archived_at,
    'updated_at', v_site.updated_at
  ));
end;
$$;

create or replace function public.delete_site(p_site_id uuid, p_client_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_site public.sites;
  v_saved jsonb;
  v_used integer;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_site := app.lock_site(v_profile, p_site_id);

  select count(*) into v_used from public.tasks where site_id = v_site.id;
  if v_used > 0 then
    perform app.fail('MB423', 'site_in_use', jsonb_build_object('tasks', v_used));
  end if;

  delete from public.sites where id = v_site.id;

  return app.remember_response(p_client_key, 'delete_site', jsonb_build_object(
    'result', 'ok',
    'site_id', v_site.id,
    'changed', true
  ));
end;
$$;

create or replace function public.update_crew(
  p_crew_id uuid,
  p_name text,
  p_members text[],
  p_client_key uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_crew public.crews;
  v_saved jsonb;
  v_name text;
  v_member text;
  v_members text[] := '{}';
  v_current text[];
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_crew := app.lock_crew(v_profile, p_crew_id);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;

  if p_expected_updated_at is not null and v_crew.updated_at <> p_expected_updated_at then
    perform app.fail('MB409', 'version_conflict', jsonb_build_object('updated_at', v_crew.updated_at));
  end if;
  if v_crew.archived_at is not null then
    perform app.fail('MB423', 'crew_archived');
  end if;

  v_name := app.clean_text(p_name, 'name', 2, 120);
  if coalesce(cardinality(p_members), 0) > 30 then
    perform app.fail('MB422', 'too_many_members', jsonb_build_object('field', 'members', 'max_count', 30));
  end if;
  foreach v_member in array coalesce(p_members, '{}'::text[]) loop
    v_members := v_members || app.clean_text(v_member, 'members', 1, 120);
  end loop;

  select coalesce(array_agg(m.name order by m.position, m.created_at, m.id), '{}'::text[]) into v_current
  from public.crew_members m
  where m.crew_id = v_crew.id;

  if v_name = v_crew.name and v_members = v_current then
    return app.remember_response(p_client_key, 'update_crew', jsonb_build_object(
      'result', 'ok',
      'crew_id', v_crew.id,
      'changed', false,
      'updated_at', v_crew.updated_at
    ));
  end if;

  if v_members <> v_current then
    delete from public.crew_members where crew_id = v_crew.id;
    insert into public.crew_members (crew_id, name, position)
    select v_crew.id, m.name, m.position
    from unnest(v_members) with ordinality as m(name, position);
  end if;

  update public.crews
  set name = v_name, updated_at = now()
  where id = v_crew.id
  returning * into v_crew;

  return app.remember_response(p_client_key, 'update_crew', jsonb_build_object(
    'result', 'ok',
    'crew_id', v_crew.id,
    'changed', true,
    'updated_at', v_crew.updated_at
  ));
end;
$$;

create or replace function public.site_summaries(p_query text default null, p_include_archived boolean default false)
returns table (
  id uuid,
  name text,
  address text,
  contact text,
  archived_at timestamptz,
  active_tasks integer,
  total_tasks integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.address,
    s.contact,
    s.archived_at,
    (count(t.id) filter (where t.status in ('Assigned', 'Accepted', 'InProgress', 'InReview')))::integer,
    count(t.id)::integer
  from public.sites s
  left join public.tasks t on t.site_id = s.id
  where (coalesce(p_include_archived, false) or s.archived_at is null)
    and (
      nullif(btrim(p_query), '') is null
      or strpos(lower(s.name), lower(btrim(p_query))) > 0
      or strpos(lower(s.address), lower(btrim(p_query))) > 0
    )
  group by s.id
  order by s.archived_at is not null, s.name, s.id
$$;

create or replace function public.crew_summaries()
returns table (
  id uuid,
  name text,
  foreman_id uuid,
  foreman_name text,
  archived_at timestamptz,
  members integer,
  assigned integer,
  accepted integer,
  in_progress integer,
  in_review integer,
  overdue integer,
  open_obstacles integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.foreman_id,
    p.full_name,
    c.archived_at,
    (select count(*) from public.crew_members m where m.crew_id = c.id)::integer,
    (count(t.id) filter (where t.status = 'Assigned'))::integer,
    (count(t.id) filter (where t.status = 'Accepted'))::integer,
    (count(t.id) filter (where t.status = 'InProgress'))::integer,
    (count(t.id) filter (where t.status = 'InReview'))::integer,
    (count(t.id) filter (where t.status in ('Assigned', 'Accepted', 'InProgress') and t.planned_end < now()))::integer,
    (count(o.id))::integer
  from public.crews c
  left join public.profiles p on p.id = c.foreman_id
  left join public.tasks t
    on t.crew_id = c.id and t.status in ('Assigned', 'Accepted', 'InProgress', 'InReview')
  left join public.task_obstacles o on o.task_id = t.id and o.closed_at is null
  group by c.id, p.full_name
  order by c.archived_at is not null, c.name, c.id
$$;

revoke all on function public.create_site(text, text, text, text, uuid) from public, anon;
revoke all on function public.update_site(uuid, text, text, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.archive_site(uuid, uuid) from public, anon;
revoke all on function public.restore_site(uuid, uuid) from public, anon;
revoke all on function public.delete_site(uuid, uuid) from public, anon;
revoke all on function public.update_crew(uuid, text, text[], uuid, timestamptz) from public, anon;
revoke all on function public.site_summaries(text, boolean) from public, anon;
revoke all on function public.crew_summaries() from public, anon;

grant execute on function public.create_site(text, text, text, text, uuid) to authenticated;
grant execute on function public.update_site(uuid, text, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.archive_site(uuid, uuid) to authenticated;
grant execute on function public.restore_site(uuid, uuid) to authenticated;
grant execute on function public.delete_site(uuid, uuid) to authenticated;
grant execute on function public.update_crew(uuid, text, text[], uuid, timestamptz) to authenticated;
grant execute on function public.site_summaries(text, boolean) to authenticated;
grant execute on function public.crew_summaries() to authenticated;
