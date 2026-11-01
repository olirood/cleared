-- Cleared · código por correo antes de firmar
-- El enlace llega por WhatsApp; al firmar, Cleared manda un código de 6 dígitos al correo
-- que quedó congelado en el split. Sin ese código no se puede firmar, ni llamando a la base
-- directamente. Solo el servidor del sitio (con su llave) puede crear códigos y leer correos.

create schema if not exists cleared_private;
revoke all on schema cleared_private from public, anon, authenticated;

create table cleared_private.settings (key text primary key, value text not null);
revoke all on cleared_private.settings from public, anon, authenticated;
-- llave del servidor: se genera aquí y se copia a Cloudflare como secreto
insert into cleared_private.settings (key, value)
values ('server_key', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create table cleared_private.signing_codes (
  signature_id  uuid primary key references public.signatures on delete cascade,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      int not null default 0,
  sends         int not null default 0,
  window_start  timestamptz not null default now(),
  last_sent_at  timestamptz not null default now()
);
revoke all on cleared_private.signing_codes from public, anon, authenticated;

create function cleared_private.check_key(k text) returns void
language plpgsql security definer set search_path = cleared_private, public as $$
begin
  if k is null or k <> (select value from cleared_private.settings where key = 'server_key') then
    raise exception 'Llave de servidor inválida';
  end if;
end $$;

create function cleared_private.code_hash(code text, sig uuid) returns text
language sql immutable as $$ select encode(sha256(convert_to(sig::text || ':' || code, 'UTF8')), 'hex') $$;

-- Correo enmascarado para mostrarle al firmante a dónde llega su código
create function public.mask_email(e text) returns text
language sql immutable as $$
  select case when e is null or position('@' in e) < 2 then null
              else left(e, 1) || repeat('•', greatest(2, position('@' in e) - 2)) || substr(e, position('@' in e)) end
$$;

-- ============ El servidor crea el código y recibe el correo a dónde mandarlo ============

create function public.prepare_signing_code(token_hash text, code text, server_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record; c record;
begin
  perform cleared_private.check_key(server_key);
  if code !~ '^\d{6}$' then raise exception 'Código inválido'; end if;
  select sig.id, sig.status, sig.expires_at, sp.snapshot, ag.status as ag_status, w.title, ws.name as ws_name
    into s
    from signatures sig
    join split_participants sp on sp.id = sig.participant_id
    join split_agreements ag on ag.id = sp.agreement_id
    join works w on w.id = ag.work_id
    join workspaces ws on ws.id = w.workspace_id
   where sig.token_hash = prepare_signing_code.token_hash;
  if s is null or s.status <> 'pending' or s.expires_at < now() or s.ag_status <> 'sent' then
    raise exception 'Enlace inválido';
  end if;
  if coalesce(s.snapshot->>'email', '') = '' then raise exception 'Sin correo'; end if;

  select * into c from cleared_private.signing_codes where signature_id = s.id for update;
  if c is not null then
    if c.last_sent_at > now() - interval '30 seconds' then raise exception 'Espera'; end if;
    if c.window_start > now() - interval '1 hour' and c.sends >= 5 then raise exception 'Demasiados'; end if;
  end if;
  insert into cleared_private.signing_codes (signature_id, code_hash, expires_at, attempts, sends, window_start, last_sent_at)
  values (s.id, cleared_private.code_hash(code, s.id), now() + interval '10 minutes', 0, 1, now(), now())
  on conflict (signature_id) do update
     set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, last_sent_at = now(),
         sends = case when cleared_private.signing_codes.window_start > now() - interval '1 hour' then cleared_private.signing_codes.sends + 1 else 1 end,
         window_start = case when cleared_private.signing_codes.window_start > now() - interval '1 hour' then cleared_private.signing_codes.window_start else now() end;
  return jsonb_build_object('email', s.snapshot->>'email', 'name', s.snapshot->>'legal_name', 'title', s.title, 'workspace', s.ws_name);
end $$;
revoke all on function public.prepare_signing_code(text, text, text) from public;
grant execute on function public.prepare_signing_code(text, text, text) to anon, authenticated;

-- ============ Firmar exige el código ============

drop function public.sign_split(text, text, text, text, text);

create function public.sign_split(token_hash text, code text, typed_name text, consent_version text, ip text, user_agent text) returns text
language plpgsql security definer set search_path = public as $$
declare s record; c record; left_ int;
begin
  select sig.id, sig.status, sig.expires_at, sp.agreement_id, sp.snapshot, w.workspace_id
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

  -- el código: vigente, pocos intentos; un error suma intento (sin deshacerse)
  select * into c from cleared_private.signing_codes where signature_id = s.id for update;
  if c is null then return 'no_code'; end if;
  if c.expires_at < now() or c.attempts >= 5 then return 'code_expired'; end if;
  if c.code_hash <> cleared_private.code_hash(coalesce(code, ''), s.id) then
    update cleared_private.signing_codes set attempts = attempts + 1 where signature_id = s.id;
    return 'bad_code';
  end if;
  delete from cleared_private.signing_codes where signature_id = s.id;

  update signatures set status = 'signed', signed_at = now(), typed_name = trim(sign_split.typed_name),
         method = 'Enlace único por WhatsApp + código al correo ' || coalesce(mask_email(s.snapshot->>'email'), '') || ' + nombre escrito',
         consent_version = sign_split.consent_version,
         ip = nullif(sign_split.ip, '')::inet, user_agent = left(sign_split.user_agent, 400)
   where id = s.id;
  insert into audit_events (workspace_id, entity, entity_id, action, detail, actor)
  values (s.workspace_id, 'split', s.agreement_id, 'signed', jsonb_build_object('signature', s.id, 'typed_name', trim(typed_name), 'email_verified', true), null);
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
revoke all on function public.sign_split(text, text, text, text, text, text) from public;
grant execute on function public.sign_split(text, text, text, text, text, text) to anon, authenticated;

-- ============ Documento final para el correo (solo el servidor) ============

create function public.completed_document_for(agreement uuid, server_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare doc jsonb;
begin
  perform cleared_private.check_key(server_key);
  select jsonb_build_object(
    'agreement', jsonb_build_object('id', ag.id, 'version', ag.version, 'status', ag.status, 'template', ag.template,
                                    'sent_at', ag.sent_at, 'completed_at', ag.completed_at, 'content_sha256', ag.content_sha256),
    'work', jsonb_build_object('title', w.title, 'artist', w.artist, 'session_date', w.session_date),
    'workspace', jsonb_build_object('name', ws.name, 'template', ws.letter_template),
    'participants', (select jsonb_agg(jsonb_build_object(
        'role', sp.role, 'share_bp', sp.share_bp, 'credits', sp.credits, 'snapshot', sp.snapshot,
        'status', sg.status, 'signed_at', sg.signed_at, 'typed_name', sg.typed_name, 'method', sg.method, 'ip', host(sg.ip)
      ) order by sp.position, sp.id)
      from split_participants sp left join signatures sg on sg.participant_id = sp.id
      where sp.agreement_id = ag.id),
    'log', (select jsonb_agg(jsonb_build_object('at', e.at, 'action', e.action, 'detail', e.detail) order by e.at)
              from audit_events e where e.entity = 'split' and e.entity_id = ag.id))
    into doc
    from split_agreements ag join works w on w.id = ag.work_id join workspaces ws on ws.id = w.workspace_id
   where ag.id = agreement and ag.status = 'signed';
  if doc is null then raise exception 'El split aún no está firmado por todos'; end if;
  return doc;
end $$;
revoke all on function public.completed_document_for(uuid, text) from public;
grant execute on function public.completed_document_for(uuid, text) to anon, authenticated;

create function public.completed_document(token_hash text, server_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ag_id uuid;
begin
  perform cleared_private.check_key(server_key);
  select sp.agreement_id into ag_id
    from signatures sig join split_participants sp on sp.id = sig.participant_id
   where sig.token_hash = completed_document.token_hash;
  if ag_id is null then raise exception 'Enlace inválido'; end if;
  return completed_document_for(ag_id, server_key);
end $$;
revoke all on function public.completed_document(text, text) from public;
grant execute on function public.completed_document(text, text) to anon, authenticated;

-- ============ La vista del firmante muestra a dónde llega su código ============

create or replace function public.signing_view(token_hash text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; doc jsonb;
begin
  select sig.id, sig.status, sig.expires_at, sig.signed_at, sp.id as pid, sp.agreement_id, sp.snapshot
    into s
    from signatures sig join split_participants sp on sp.id = sig.participant_id
   where sig.token_hash = signing_view.token_hash;
  if s is null then return null; end if;
  select jsonb_build_object(
    'me', s.pid,
    'my_status', case when s.status = 'pending' and s.expires_at < now() then 'expired' else s.status end,
    'signed_at', s.signed_at,
    'email_hint', mask_email(s.snapshot->>'email'),
    'agreement', jsonb_build_object('id', ag.id, 'version', ag.version, 'status', ag.status,
                                    'sent_at', ag.sent_at, 'completed_at', ag.completed_at, 'content_sha256', ag.content_sha256),
    'work', jsonb_build_object('title', w.title, 'artist', w.artist, 'session_date', w.session_date),
    'workspace', jsonb_build_object('name', ws.name, 'template', coalesce(ag.template, ws.letter_template)),
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
