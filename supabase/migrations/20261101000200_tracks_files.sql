-- Cleared · tracks y archivos
-- 1. Quién se encarga de lo legal (WFH, waivers, licencias): por espacio, con excepción por track.
-- 2. Archivos: audio y video solo como enlace; portada y documentos guardados en Cleared.
-- 3. Almacén privado "cleared": cada archivo vive en una carpeta con el id de su espacio
--    y solo lo ven los miembros de ese espacio.

-- ============ Lo legal ============

alter table public.workspaces add column label_handles_legal boolean not null default false;
update public.workspaces set label_handles_legal = true where slug = 'octavio';

-- null = como diga el espacio; true/false = excepción para este track
alter table public.recordings add column label_handles_legal boolean;

-- ============ Archivos ============

alter table public.assets drop constraint assets_kind_check;
alter table public.assets add constraint assets_kind_check check (kind in (
  -- enlaces
  'demo', 'mix', 'master', 'instrumental', 'video', 'other_link',
  -- guardados
  'cover', 'wfh', 'waiver', 'license', 'other_doc'
));
alter table public.assets add column label text;          -- nombre que se muestra
alter table public.assets add column mime text;
alter table public.assets add column thumb_key text;      -- miniatura de la portada
alter table public.assets add constraint assets_where check (
  case when kind in ('demo', 'mix', 'master', 'instrumental', 'video', 'other_link')
       then external_url ~ '^https://' and storage_key is null
       else storage_key is not null and external_url is null end
);
create index assets_rec_idx on public.assets (recording_id);
-- una sola portada vigente por track
create unique index assets_one_cover on public.assets (recording_id) where kind = 'cover';

-- ============ Almacén privado ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cleared', 'cleared', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- primer tramo de la ruta = id del espacio ("<espacio>/<track>/<archivo>")
create function public.path_workspace(path text) returns uuid
language sql immutable as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(path, '/', 1)::uuid end;
$$;

create policy cleared_files_read on storage.objects for select to authenticated
  using (bucket_id = 'cleared' and is_member(path_workspace(name)));
create policy cleared_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cleared' and can_write(path_workspace(name)));
create policy cleared_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cleared' and can_write(path_workspace(name)));

-- ============ Corrección: "solo lectura" de verdad ============
-- Las políticas "for all" dejaban borrar con solo ser miembro. Se separan:
-- ver = miembro; crear y editar = operación o más; borrar grabaciones = administración.

drop policy rec_all on public.recordings;
create policy rec_read   on public.recordings for select to authenticated using (is_member(workspace_id));
create policy rec_insert on public.recordings for insert to authenticated with check (can_write(workspace_id));
create policy rec_update on public.recordings for update to authenticated using (can_write(workspace_id)) with check (can_write(workspace_id));
create policy rec_delete on public.recordings for delete to authenticated using (is_admin(workspace_id));

create function public.rec_member(rec uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from recordings r where r.id = rec and is_member(r.workspace_id));
$$;
create function public.rec_writer(rec uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from recordings r where r.id = rec and can_write(r.workspace_id));
$$;

drop policy codes_all on public.recording_codes;
create policy codes_read  on public.recording_codes for select to authenticated using (rec_member(recording_id));
create policy codes_write on public.recording_codes for insert to authenticated with check (rec_writer(recording_id));
create policy codes_upd   on public.recording_codes for update to authenticated using (rec_writer(recording_id)) with check (rec_writer(recording_id));
create policy codes_del   on public.recording_codes for delete to authenticated using (rec_writer(recording_id));

drop policy credits_all on public.credits;
create policy credits_read  on public.credits for select to authenticated using (rec_member(recording_id));
create policy credits_write on public.credits for insert to authenticated with check (rec_writer(recording_id));
create policy credits_upd   on public.credits for update to authenticated using (rec_writer(recording_id)) with check (rec_writer(recording_id));
create policy credits_del   on public.credits for delete to authenticated using (rec_writer(recording_id));

drop policy assets_all on public.assets;
create policy assets_read  on public.assets for select to authenticated using (rec_member(recording_id));
create policy assets_write on public.assets for insert to authenticated with check (rec_writer(recording_id));
create policy assets_upd   on public.assets for update to authenticated using (rec_writer(recording_id)) with check (rec_writer(recording_id));
create policy assets_del   on public.assets for delete to authenticated using (rec_writer(recording_id));
