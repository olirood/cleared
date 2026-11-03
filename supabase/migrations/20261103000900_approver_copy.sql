-- Cleared · copia final también a quien aprobó por el espacio que representa
-- (p. ej. Margarita cuando Oliver manda un split con una compositora de Apollo)

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
