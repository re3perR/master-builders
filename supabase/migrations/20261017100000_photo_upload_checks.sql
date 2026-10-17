drop policy if exists task_photos_insert_staged on storage.objects;

create or replace function app.lock_staged_upload(p_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.uploads u
  where u.storage_path = p_storage_path
    and u.uploaded_by = auth.uid()
    and u.report_id is null
  for share;
  return found;
end;
$$;

revoke all on function app.lock_staged_upload(text) from public, anon;
grant execute on function app.lock_staged_upload(text) to authenticated;

drop policy if exists task_photos_delete_staged on storage.objects;

create policy task_photos_delete_staged on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-photos' and app.lock_staged_upload(name));

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
  v_linked integer;
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

  perform 1
  from public.uploads u
  where u.id = any (p_upload_ids)
    and u.task_id = v_task.id
    and u.uploaded_by = v_profile.id
    and u.report_id is null
  order by u.id
  for update;

  select count(*) into v_valid
  from public.uploads u
  join storage.objects o on o.bucket_id = 'task-photos' and o.name = u.storage_path
  where u.id = any (p_upload_ids)
    and u.task_id = v_task.id
    and u.uploaded_by = v_profile.id
    and u.report_id is null
    and o.metadata ->> 'size' = u.size_bytes::text
    and o.metadata ->> 'mimetype' = u.mime_type;

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
  where u.id = ord.upload_id
    and u.report_id is null;
  get diagnostics v_linked = row_count;

  if v_linked <> v_count then
    perform app.fail('MB422', 'uploads_not_ready', jsonb_build_object('field', 'photos'));
  end if;

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

revoke all on function public.submit_report(uuid, integer, text, uuid[], uuid) from public, anon;
grant execute on function public.submit_report(uuid, integer, text, uuid[], uuid) to authenticated;
