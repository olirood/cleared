-- Cleared · copia final a quien envió, PDF firmado archivado y respaldo mensual
-- 1. El documento final incluye a quien mandó el split, para que también reciba la copia.
-- 2. El split guarda dónde quedó su PDF firmado (en el almacén privado del espacio).
-- 3. export_backup(): toda la información en un solo JSON, solo con la llave del servidor.

alter table public.split_agreements add column final_pdf_key text;
alter table public.split_agreements add column final_pdf_sha256 text;

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
        'status', sg.status, 'signed_at', sg.signed_at, 'typed_name', sg.typed_name, 'method', sg.method, 'ip', host(sg.ip)
      ) order by sp.position, sp.id)
      from split_participants sp left join signatures sg on sg.participant_id = sp.id
      where sp.agreement_id = ag.id),
    'sender', (select jsonb_build_object('email', u.email, 'name', coalesce(m.display_name, ''))
                 from audit_events e
                 join auth.users u on u.id = e.actor
                 left join memberships m on m.user_id = e.actor and m.workspace_id = ws.id
                where e.entity = 'split' and e.entity_id = ag.id and e.action = 'sent'
                order by e.at desc limit 1),
    'log', (select jsonb_agg(jsonb_build_object('at', e.at, 'action', e.action, 'detail', e.detail) order by e.at)
              from audit_events e where e.entity = 'split' and e.entity_id = ag.id))
    into doc
    from split_agreements ag join works w on w.id = ag.work_id join workspaces ws on ws.id = w.workspace_id
   where ag.id = agreement and ag.status = 'signed';
  if doc is null then raise exception 'El split aún no está firmado por todos'; end if;
  return doc;
end $$;

create function public.export_backup(server_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform cleared_private.check_key(server_key);
  return jsonb_build_object(
    'exported_at', now(),
    'workspaces', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from workspaces x),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('email', u.email)), '[]') from memberships x left join auth.users u on u.id = x.user_id),
    'invitations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from invitations x),
    'publishers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from publishers x),
    'people', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from people x),
    'works', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from works x),
    'recordings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from recordings x),
    'recording_codes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from recording_codes x),
    'credits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from credits x),
    'assets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from assets x),
    'split_agreements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from split_agreements x),
    'split_participants', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from split_participants x),
    'split_approvals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from split_approvals x),
    -- sin la huella del enlace de firma
    'signatures', (select coalesce(jsonb_agg(to_jsonb(x) - 'token_hash'), '[]') from signatures x),
    'change_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from change_requests x),
    'audit_events', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from audit_events x)
  );
end $$;
revoke all on function public.export_backup(text) from public;
grant execute on function public.export_backup(text) to anon, authenticated;

-- Margarita administra Apollo (puede invitar a su equipo)
update public.memberships set role = 'admin'
 where workspace_id = (select id from public.workspaces where slug = 'apollo') and role = 'operator';
update public.invitations set role = 'admin'
 where workspace_id = (select id from public.workspaces where slug = 'apollo') and role = 'operator';
