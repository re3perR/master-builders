create or replace function app.session_ended()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session uuid := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')::uuid;
begin
  if v_session is null then
    return false;
  end if;
  return not exists (
    select 1
    from auth.sessions s
    where s.id = v_session
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  );
end;
$$;

revoke all on function app.session_ended() from public, anon;
grant execute on function app.session_ended() to authenticated, service_role;

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
  if auth.uid() is null or app.session_ended() then
    perform app.fail('MB401', 'not_authenticated');
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    perform app.fail('MB403', 'profile_missing');
  end if;
  return v_profile;
end;
$$;

drop policy if exists task_photos_read on storage.objects;

create policy task_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-photos'
    and not (select app.session_ended())
    and exists (
      select 1 from public.uploads u
      where u.storage_path = storage.objects.name
        and app.can_read_task(u.task_id)
        and (u.report_id is not null or u.uploaded_by = auth.uid())
    )
  );
