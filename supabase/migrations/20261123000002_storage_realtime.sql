-- Event cover images. Public read (paths are unguessable UUIDs and the image is
-- meant to be shown on the public invitation page); writes restricted to editors.
-- Path layout: <workspace_id>/<event_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_edit_cover_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := string_to_array(p_name, '/'); v_event uuid;
begin
  if array_length(v_parts, 1) <> 3 then return false; end if;
  begin
    v_event := v_parts[2]::uuid;
  exception when others then return false;
  end;
  return exists (select 1 from public.events e where e.id = v_event and e.workspace_id::text = v_parts[1])
     and public.can_edit_event(v_event);
end; $$;
revoke execute on function public.can_edit_cover_path(text) from public, anon;
grant execute on function public.can_edit_cover_path(text) to authenticated, service_role;

create policy "covers editors insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-covers' and public.can_edit_cover_path(name));
create policy "covers editors update" on storage.objects for update to authenticated
  using (bucket_id = 'event-covers' and public.can_edit_cover_path(name))
  with check (bucket_id = 'event-covers' and public.can_edit_cover_path(name));
create policy "covers editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-covers' and public.can_edit_cover_path(name));

-- Live dashboard updates. Realtime applies RLS + column privileges per subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.event_guests;
  end if;
end $$;
