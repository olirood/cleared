-- Cleared · idioma de la carta de split (inglés o español), elegido por quien crea el split.
-- Todos firman el mismo texto; la pantalla de firma y el aviso los elige cada firmante.

alter table public.split_agreements add column language text not null default 'en'
  check (language in ('en', 'es'));

-- al enviar se congela: no se cambia el idioma de una versión que ya está en firma o firmada
create function public.freeze_language() returns trigger language plpgsql as $$
begin
  if new.language is distinct from old.language and old.status <> 'draft' then
    raise exception 'El idioma de la carta se congela al enviarla';
  end if;
  return new;
end $$;
create trigger split_language_frozen before update of language on public.split_agreements
  for each row execute function public.freeze_language();

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
                                    'sent_at', ag.sent_at, 'completed_at', ag.completed_at, 'content_sha256', ag.content_sha256, 'language', ag.language),
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

create or replace function public.completed_document_for(agreement uuid, server_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare doc jsonb;
begin
  perform cleared_private.check_key(server_key);
  select jsonb_build_object(
    'agreement', jsonb_build_object('id', ag.id, 'version', ag.version, 'status', ag.status, 'template', ag.template,
                                    'sent_at', ag.sent_at, 'completed_at', ag.completed_at, 'content_sha256', ag.content_sha256, 'language', ag.language),
    'work', jsonb_build_object('id', w.id, 'title', w.title, 'artist', w.artist, 'session_date', w.session_date),
    'workspace', jsonb_build_object('id', ws.id, 'name', ws.name, 'template', ws.letter_template),
    'participants', (select jsonb_agg(jsonb_build_object(
        'role', sp.role, 'share_bp', sp.share_bp, 'credits', sp.credits, 'snapshot', sp.snapshot,
        'status', sg.status, 'signed_at', sg.signed_at, 'typed_name', sg.typed_name, 'method', sg.method, 'ip', host(sg.ip),
        'signature_png', sg.signature_png, 'consent_version', sg.consent_version
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
