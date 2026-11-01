-- Cleared · splits y firmas
-- 1. Obra: artista que aparece en la carta (lo ve también el espacio que representa).
-- 2. Label copy: UPC del lanzamiento e idioma de la grabación.
-- 3. Bitácora: cada miembro registra lo que hace en su espacio.
-- 4. Firmas sin cuenta: el firmante entra con un enlace único. La base guarda solo la
--    huella del enlace; estas funciones son la única puerta para verlo y firmarlo.

alter table public.works add column artist text;
alter table public.recordings add column upc text check (upc ~ '^\d{12,13}$');
alter table public.recordings add column language text;
alter table public.signatures add column typed_name text;

create policy audit_insert on public.audit_events for insert to authenticated
  with check (actor = auth.uid() and (workspace_id is null or is_member(workspace_id)));

-- al anular una versión, sus enlaces de firma dejan de servir
create function public.void_signatures() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status <> 'void' then
    update signatures s set status = 'void'
      from split_participants sp
     where sp.id = s.participant_id and sp.agreement_id = new.id and s.status = 'pending';
  end if;
  return new;
end $$;
create trigger split_void_signatures after update on public.split_agreements
  for each row execute function public.void_signatures();

-- ============ Enlaces de firma ============

-- Crea o renueva el enlace de un firmante (el anterior deja de servir).
-- Puede hacerlo el espacio dueño de la obra o el que representa a esa persona.
create function public.issue_signature_link(participant uuid, token_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select ag.id, ag.status, w.workspace_id, p.represented_by into a
    from split_participants sp
    join split_agreements ag on ag.id = sp.agreement_id
    join works w on w.id = ag.work_id
    join people p on p.id = sp.person_id
   where sp.id = participant;
  if a is null then raise exception 'No existe ese participante'; end if;
  if not (can_write(a.workspace_id) or (a.represented_by is not null and can_write(a.represented_by))) then
    raise exception 'Sin permiso para generar enlaces de este split';
  end if;
  if a.status <> 'sent' then raise exception 'El split no está en firma'; end if;
  if length(token_hash) <> 64 then raise exception 'Huella inválida'; end if;
  if exists (select 1 from signatures where participant_id = participant and status = 'signed') then
    raise exception 'Esta persona ya firmó';
  end if;
  insert into signatures (participant_id, token_hash, status, expires_at)
  values (participant, token_hash, 'pending', now() + interval '30 days')
  on conflict (participant_id) do update
     set token_hash = excluded.token_hash, status = 'pending', expires_at = excluded.expires_at;
  insert into audit_events (workspace_id, entity, entity_id, action, detail)
  values (a.workspace_id, 'split', a.id, 'link_issued', jsonb_build_object('participant', participant));
end $$;
revoke all on function public.issue_signature_link(uuid, text) from public, anon;
grant execute on function public.issue_signature_link(uuid, text) to authenticated;

-- Lo que ve el firmante: la carta completa (sin contactos de los demás) y su estado
create function public.signing_view(token_hash text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; doc jsonb;
begin
  select sig.id, sig.status, sig.expires_at, sig.signed_at, sp.id as pid, sp.agreement_id
    into s
    from signatures sig join split_participants sp on sp.id = sig.participant_id
   where sig.token_hash = signing_view.token_hash;
  if s is null then return null; end if;
  select jsonb_build_object(
    'me', s.pid,
    'my_status', case when s.status = 'pending' and s.expires_at < now() then 'expired' else s.status end,
    'signed_at', s.signed_at,
    'agreement', jsonb_build_object('id', ag.id, 'version', ag.version, 'status', ag.status,
                                    'sent_at', ag.sent_at, 'completed_at', ag.completed_at, 'content_sha256', ag.content_sha256),
    'work', jsonb_build_object('title', w.title, 'artist', w.artist, 'session_date', w.session_date),
    'workspace', jsonb_build_object('name', ws.name, 'template', ws.letter_template),
    'participants', (select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'role', sp.role, 'share_bp', sp.share_bp, 'credits', sp.credits,
        'legal_name', sp.snapshot->>'legal_name', 'credit_name', sp.snapshot->>'credit_name',
        'pro', sp.snapshot->>'pro', 'ipi', sp.snapshot->>'ipi', 'publisher', sp.snapshot->>'publisher',
        'signed', coalesce(sg.status = 'signed', false), 'signed_at', sg.signed_at
      ) order by sp.position, sp.id)
      from split_participants sp left join signatures sg on sg.participant_id = sp.id
      where sp.agreement_id = ag.id))
    into doc
    from split_agreements ag
    join works w on w.id = ag.work_id
    join workspaces ws on ws.id = w.workspace_id
   where ag.id = s.agreement_id;
  return doc;
end $$;
revoke all on function public.signing_view(text) from public;
grant execute on function public.signing_view(text) to anon, authenticated;

-- Firmar: enlace vigente, split en firma; al firmar el último, el split queda firmado
create function public.sign_split(token_hash text, typed_name text, consent_version text, ip text, user_agent text) returns text
language plpgsql security definer set search_path = public as $$
declare s record; left_ int;
begin
  select sig.id, sig.status, sig.expires_at, sp.agreement_id, w.workspace_id
    into s
    from signatures sig
    join split_participants sp on sp.id = sig.participant_id
    join split_agreements ag on ag.id = sp.agreement_id
    join works w on w.id = ag.work_id
   where sig.token_hash = sign_split.token_hash
   for update of sig;
  if s is null then raise exception 'Enlace inválido'; end if;
  if s.status = 'signed' then return 'already'; end if;
  if s.status <> 'pending' then raise exception 'Este enlace ya no es válido'; end if;
  if s.expires_at < now() then raise exception 'El enlace caducó; pide uno nuevo'; end if;
  if (select status from split_agreements where id = s.agreement_id) <> 'sent' then
    raise exception 'Este split ya no está en firma';
  end if;
  if coalesce(length(trim(typed_name)), 0) < 3 or consent_version is null then
    raise exception 'Falta tu nombre o tu consentimiento';
  end if;
  update signatures set status = 'signed', signed_at = now(), typed_name = trim(sign_split.typed_name),
         method = 'Enlace único + nombre escrito', consent_version = sign_split.consent_version,
         ip = nullif(sign_split.ip, '')::inet, user_agent = left(sign_split.user_agent, 400)
   where id = s.id;
  insert into audit_events (workspace_id, entity, entity_id, action, detail, actor)
  values (s.workspace_id, 'split', s.agreement_id, 'signed', jsonb_build_object('signature', s.id, 'typed_name', trim(typed_name)), null);
  select count(*) into left_
    from split_participants sp left join signatures sg on sg.participant_id = sp.id
   where sp.agreement_id = s.agreement_id and coalesce(sg.status, '') <> 'signed';
  if left_ = 0 then
    update split_agreements set status = 'signed', completed_at = now() where id = s.agreement_id;
    insert into audit_events (workspace_id, entity, entity_id, action, actor)
    values (s.workspace_id, 'split', s.agreement_id, 'completed', null);
    return 'completed';
  end if;
  return 'signed';
end $$;
revoke all on function public.sign_split(text, text, text, text, text) from public;
grant execute on function public.sign_split(text, text, text, text, text) to anon, authenticated;

-- El firmante pide un cambio en vez de firmar
create function public.request_split_change(token_hash text, note text) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select sig.status, sig.expires_at, sp.id as pid, sp.agreement_id, w.workspace_id into s
    from signatures sig
    join split_participants sp on sp.id = sig.participant_id
    join split_agreements ag on ag.id = sp.agreement_id
    join works w on w.id = ag.work_id
   where sig.token_hash = request_split_change.token_hash;
  if s is null or s.status <> 'pending' or s.expires_at < now() then raise exception 'Enlace inválido'; end if;
  if coalesce(length(trim(note)), 0) < 3 then raise exception 'Escribe qué hay que cambiar'; end if;
  insert into change_requests (agreement_id, participant_id, note) values (s.agreement_id, s.pid, left(trim(note), 1000));
  insert into audit_events (workspace_id, entity, entity_id, action, detail, actor)
  values (s.workspace_id, 'split', s.agreement_id, 'change_requested', jsonb_build_object('participant', s.pid), null);
end $$;
revoke all on function public.request_split_change(text, text) from public;
grant execute on function public.request_split_change(text, text) to anon, authenticated;

-- La bitácora del split la ve quien ve el split
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using ((workspace_id is null and is_insider()) or is_member(workspace_id)
         or (entity = 'split' and exists (select 1 from split_agreements a where a.id = entity_id and can_see_work(a.work_id))));

-- evidencia de firma visible para quien ve el split (el enlace sigue oculto)
grant select (typed_name, ip, user_agent) on public.signatures to authenticated;
