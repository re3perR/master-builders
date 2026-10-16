drop policy if exists task_photos_delete_staged on storage.objects;

create policy task_photos_delete_staged on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-photos'
    and exists (
      select 1 from public.uploads u
      where u.storage_path = storage.objects.name
        and u.uploaded_by = auth.uid()
        and u.report_id is null
    )
  );
