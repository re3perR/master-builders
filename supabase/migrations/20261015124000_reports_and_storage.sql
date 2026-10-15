insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.register_upload(
  p_task_id uuid,
  p_mime_type text,
  p_size_bytes integer,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_task public.tasks;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_path text;
begin
  perform app.require_role(v_profile, 'foreman');
  v_task := app.lock_task(v_profile, p_task_id, null);
  perform app.require_status(v_task, 'InProgress');

  v_ext := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
  end;
  if v_ext is null then
    perform app.fail('MB422', 'unsupported_file_type', jsonb_build_object('field', 'photos'));
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    perform app.fail('MB422', 'file_too_large', jsonb_build_object('field', 'photos', 'max_bytes', 10485760));
  end if;
  if (
    select count(*) from public.uploads
    where task_id = v_task.id and uploaded_by = v_profile.id and report_id is null
      and created_at > now() - interval '24 hours'
  ) >= 40 then
    perform app.fail('MB422', 'too_many_staged_files', jsonb_build_object('field', 'photos'));
  end if;

  v_path := v_task.company_id || '/' || v_task.id || '/' || v_id || '.' || v_ext;

  insert into public.uploads (id, task_id, uploaded_by, storage_path, mime_type, size_bytes, width, height)
  values (v_id, v_task.id, v_profile.id, v_path, p_mime_type, p_size_bytes, p_width, p_height);

  return jsonb_build_object('result', 'ok', 'upload_id', v_id, 'storage_path', v_path);
end;
$$;

create or replace function public.discard_upload(p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := app.require_profile();
  v_path text;
begin
  delete from public.uploads
  where id = p_upload_id and uploaded_by = v_profile.id and report_id is null
  returning storage_path into v_path;
  return jsonb_build_object('result', 'ok', 'storage_path', v_path);
end;
$$;

create or replace function public.submit_report(
  p_task_id uuid,
  p_expected_version integer,
  p_comment text,
  p_upload_ids uuid[],
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
  v_count integer;
  v_valid integer;
  v_version integer;
  v_report_id uuid;
begin
  perform app.require_role(v_profile, 'foreman');
  if p_client_key is null then
    perform app.fail('MB422', 'invalid_field', jsonb_build_object('field', 'client_key'));
  end if;
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'InProgress');

  if exists (select 1 from public.task_obstacles where task_id = v_task.id and closed_at is null) then
    perform app.fail('MB423', 'obstacle_open');
  end if;

  v_comment := app.clean_text(p_comment, 'comment', 10, 3000);

  select count(distinct u) into v_count from unnest(coalesce(p_upload_ids, '{}'::uuid[])) u;
  if v_count < 1 or v_count > 10 or v_count <> coalesce(cardinality(p_upload_ids), 0) then
    perform app.fail('MB422', 'invalid_photo_count', jsonb_build_object('field', 'photos', 'min', 1, 'max', 10));
  end if;

  select count(*) into v_valid
  from public.uploads u
  join storage.objects o on o.bucket_id = 'task-photos' and o.name = u.storage_path
  where u.id = any (p_upload_ids)
    and u.task_id = v_task.id
    and u.uploaded_by = v_profile.id
    and u.report_id is null;

  if v_valid <> v_count then
    perform app.fail('MB422', 'uploads_not_ready', jsonb_build_object('field', 'photos'));
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.task_reports where task_id = v_task.id;

  insert into public.task_reports (task_id, version, comment, submitted_by, client_key)
  values (v_task.id, v_version, v_comment, v_profile.id, p_client_key)
  returning id into v_report_id;

  update public.uploads u
  set report_id = v_report_id,
      position = ord.position
  from unnest(p_upload_ids) with ordinality as ord(upload_id, position)
  where u.id = ord.upload_id;

  update public.tasks
  set status = 'InReview', submitted_at = now()
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'report_submitted', jsonb_build_object(
    'report_id', v_report_id,
    'version', v_version,
    'photos', v_count
  ));
  perform app.log_event(v_task.id, v_profile, 'status_changed', jsonb_build_object('old', 'InProgress', 'new', 'InReview'));

  return app.remember_response(p_client_key, 'submit_report', app.task_result(v_task.id, jsonb_build_object(
    'report_id', v_report_id,
    'report_version', v_version
  )));
end;
$$;

create or replace function public.approve_report(
  p_task_id uuid,
  p_expected_version integer,
  p_report_id uuid,
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
  v_report public.task_reports;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'InReview');

  select * into v_report from public.task_reports
  where id = p_report_id and task_id = v_task.id
  for update;
  if not found then
    perform app.fail('MB404', 'report_not_found');
  end if;
  if v_report.decision <> 'pending' then
    perform app.fail('MB423', 'report_already_decided', jsonb_build_object('decision', v_report.decision));
  end if;

  update public.task_reports
  set decision = 'accepted', decided_by = v_profile.id, decided_at = now()
  where id = v_report.id;

  update public.tasks
  set status = 'Completed', completed_at = now()
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'report_accepted', jsonb_build_object(
    'report_id', v_report.id,
    'version', v_report.version,
    'submitted_at', v_report.submitted_at
  ));
  perform app.log_event(v_task.id, v_profile, 'status_changed', jsonb_build_object('old', 'InReview', 'new', 'Completed'));

  return app.remember_response(p_client_key, 'approve_report', app.task_result(v_task.id));
end;
$$;

create or replace function public.return_report(
  p_task_id uuid,
  p_expected_version integer,
  p_report_id uuid,
  p_note text,
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
  v_report public.task_reports;
  v_note text;
begin
  perform app.require_role(v_profile, 'dispatcher');
  v_task := app.lock_task(v_profile, p_task_id, null);
  v_saved := app.idempotent_response(p_client_key);
  if v_saved is not null then
    return v_saved;
  end if;
  v_task := app.lock_task(v_profile, p_task_id, p_expected_version);
  perform app.require_status(v_task, 'InReview');
  v_note := app.clean_text(p_note, 'note', 3, 3000);

  select * into v_report from public.task_reports
  where id = p_report_id and task_id = v_task.id
  for update;
  if not found then
    perform app.fail('MB404', 'report_not_found');
  end if;
  if v_report.decision <> 'pending' then
    perform app.fail('MB423', 'report_already_decided', jsonb_build_object('decision', v_report.decision));
  end if;

  update public.task_reports
  set decision = 'returned', decided_by = v_profile.id, decided_at = now(), decision_note = v_note
  where id = v_report.id;

  update public.tasks
  set status = 'InProgress'
  where id = v_task.id;

  perform app.bump(v_task.id);
  perform app.log_event(v_task.id, v_profile, 'report_returned', jsonb_build_object(
    'report_id', v_report.id,
    'version', v_report.version,
    'note', v_note
  ));
  perform app.log_event(v_task.id, v_profile, 'status_changed', jsonb_build_object('old', 'InReview', 'new', 'InProgress'));

  return app.remember_response(p_client_key, 'return_report', app.task_result(v_task.id));
end;
$$;

create or replace function public.stale_uploads(p_older_than interval default interval '24 hours')
returns table (upload_id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.storage_path
  from public.uploads u
  where u.report_id is null and u.created_at < now() - p_older_than
  union all
  select null::uuid, o.name
  from storage.objects o
  where o.bucket_id = 'task-photos'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.uploads u where u.storage_path = o.name)
$$;

create or replace function public.forget_stale_upload(p_upload_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.uploads where id = p_upload_id and report_id is null
$$;

revoke all on function public.register_upload(uuid, text, integer, integer, integer) from public, anon;
revoke all on function public.discard_upload(uuid) from public, anon;
revoke all on function public.submit_report(uuid, integer, text, uuid[], uuid) from public, anon;
revoke all on function public.approve_report(uuid, integer, uuid, uuid) from public, anon;
revoke all on function public.return_report(uuid, integer, uuid, text, uuid) from public, anon;
revoke all on function public.stale_uploads(interval) from public, anon, authenticated;
revoke all on function public.forget_stale_upload(uuid) from public, anon, authenticated;

grant execute on function public.register_upload(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.discard_upload(uuid) to authenticated;
grant execute on function public.submit_report(uuid, integer, text, uuid[], uuid) to authenticated;
grant execute on function public.approve_report(uuid, integer, uuid, uuid) to authenticated;
grant execute on function public.return_report(uuid, integer, uuid, text, uuid) to authenticated;
grant execute on function public.stale_uploads(interval) to service_role;
grant execute on function public.forget_stale_upload(uuid) to service_role;

create policy task_photos_insert_staged on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-photos'
    and exists (
      select 1 from public.uploads u
      where u.storage_path = storage.objects.name
        and u.uploaded_by = auth.uid()
        and u.report_id is null
    )
  );

create policy task_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-photos'
    and exists (
      select 1 from public.uploads u
      where u.storage_path = storage.objects.name
        and app.can_read_task(u.task_id)
        and (u.report_id is not null or u.uploaded_by = auth.uid())
    )
  );
