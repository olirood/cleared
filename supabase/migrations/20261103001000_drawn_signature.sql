-- Cleared · firma dibujada (opcional)
-- Quien firma puede dibujar su firma en vez de usar su nombre en letra manuscrita.
-- Sigue siendo obligatorio escribir el nombre completo y el código del correo: el dibujo
-- solo es cómo se ve la firma en la carta. Se guarda como PNG (máx. ~110 KB).

alter table public.signatures add column signature_png text
  check (signature_png is null or (signature_png like 'data:image/png;base64,%' and length(signature_png) <= 150000));
grant select (signature_png) on public.signatures to authenticated;

-- sign_split con la firma dibujada como último dato (opcional)
drop function public.sign_split(text, text, text, text, text, text);
create function public.sign_split(token_hash text, code text, typed_name text, consent_version text, ip text, user_agent text, signature_png text default null) returns text
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
  if sign_split.signature_png is not null
     and (sign_split.signature_png not like 'data:image/png;base64,%' or length(sign_split.signature_png) > 150000) then
    raise exception 'La firma dibujada no es válida';
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
         method = 'Enlace único por WhatsApp + código al correo ' || coalesce(mask_email(s.snapshot->>'email'), '')
                  || case when sign_split.signature_png is null then ' + nombre escrito' else ' + firma dibujada y nombre escrito' end,
         signature_png = sign_split.signature_png,
         consent_version = sign_split.consent_version,
         ip = nullif(sign_split.ip, '')::inet, user_agent = left(sign_split.user_agent, 400)
   where id = s.id;
  insert into audit_events (workspace_id, entity, entity_id, action, detail, actor)
  values (s.workspace_id, 'split', s.agreement_id, 'signed', jsonb_build_object('signature', s.id, 'typed_name', trim(typed_name), 'email_verified', true, 'drawn', sign_split.signature_png is not null), null);
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
revoke all on function public.sign_split(text, text, text, text, text, text, text) from public;
grant execute on function public.sign_split(text, text, text, text, text, text, text) to anon, authenticated;

-- el documento final y la vista del firmante traen la firma dibujada
create or replace function public.completed_document_for(agreement uuid, server_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare doc jsonb;
begin
  perform cleared_private.check_key(server_key);
  select jsonb_build_object(
    'agreement', jsonb_build_object('id', ag.id, 'version', ag.version, 'status', ag.status, 'template', ag.template,
                                    'sent_at', ag.sent_at, 'completed_at', ag.completed_at, 'content_sha256', ag.content_sha256),
    'work', jsonb_build_object('id', w.id, 'title', w.title, 'artist', w.artist, 'session_date', w.session_date),
    'workspace', jsonb_build_object('id', ws.id, 'name', ws.name, 'template', ws.letter_template),
    'participants', (select jsonb_agg(jsonb_build_object(
        'role', sp.role, 'share_bp', sp.share_bp, 'credits', sp.credits, 'snapshot', sp.snapshot,
        'status', sg.status, 'signed_at', sg.signed_at, 'typed_name', sg.typed_name, 'method', sg.method, 'ip', host(sg.ip),
        'signature_png', sg.signature_png
      ) order by sp.position, sp.id)
      from split_participants sp left join signatures sg on sg.participant_id = sp.id
      where sp.agreement_id = ag.id),
    'sender', (select jsonb_build_object('email', u.email, 'name', coalesce(m.display_name, ''))
                 from audit_events e
                 join auth.users u on u.id = e.actor
                 left join memberships m on m.user_id = e.actor and m.workspace_id = ws.id
                where e.entity = 'split' and e.entity_id = ag.id and e.action = 'sent'
                order by e.at desc limit 1),
    -- quienes aprobaron por parte del espacio que representa a alguien
    'approvers', (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', coalesce(m.display_name, ''), 'workspace', aw.name)), '[]'::jsonb)
                    from split_approvals ap
                    join auth.users u on u.id = ap.decided_by
                    join workspaces aw on aw.id = ap.workspace_id
                    left join memberships m on m.user_id = ap.decided_by and m.workspace_id = ap.workspace_id
                   where ap.agreement_id = ag.id and ap.status = 'approved'),
    'log', (select jsonb_agg(jsonb_build_object('at', e.at, 'action', e.action, 'detail', e.detail) order by e.at)
              from audit_events e where e.entity = 'split' and e.entity_id = ag.id))
    into doc
    from split_agreements ag join works w on w.id = ag.work_id join workspaces ws on ws.id = w.workspace_id
   where ag.id = agreement and ag.status = 'signed';
  if doc is null then raise exception 'El split aún no está firmado por todos'; end if;
  return doc;
end $$;

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
        'signed', coalesce(sg.status = 'signed', false), 'signed_at', sg.signed_at,
        'signature_png', case when sg.status = 'signed' then sg.signature_png end
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
