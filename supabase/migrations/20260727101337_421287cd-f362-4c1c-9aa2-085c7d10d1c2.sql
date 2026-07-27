
create policy "property-photos owner read"
on storage.objects for select to authenticated
using (
  bucket_id = 'property-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "property-photos owner insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "property-photos owner update"
on storage.objects for update to authenticated
using (
  bucket_id = 'property-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "property-photos owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
