-- Cleared · aviso por correo cuando un firmante pide un cambio
-- Solo el servidor (con su llave) obtiene a quién avisar: el equipo del espacio dueño del split
-- y, si el firmante tiene representante en otro espacio, también a ese equipo.

create function public.change_notice_recipients(token_hash text, server_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  perform cleared_private.check_key(server_key);
  select sp.snapshot->>'legal_name' as signer, w.id as work_id, w.title, w.workspace_id, ws.name as ws_name, p.represented_by
    into s
    from signatures sig
    join split_participants sp on sp.id = sig.participant_id
    join split_agreements ag on ag.id = sp.agreement_id
    join works w on w.id = ag.work_id
    join workspaces ws on ws.id = w.workspace_id
    join people p on p.id = sp.person_id
   where sig.token_hash = change_notice_recipients.token_hash;
  if s is null then raise exception 'Enlace inválido'; end if;
  return jsonb_build_object(
    'signer', s.signer, 'title', s.title, 'workspace', s.ws_name, 'work_id', s.work_id,
    'to', (select coalesce(jsonb_agg(distinct jsonb_build_object('email', u.email, 'name', coalesce(m.display_name, ''))), '[]'::jsonb)
             from memberships m join auth.users u on u.id = m.user_id
            where m.role in ('owner', 'admin', 'operator')
              and u.email is not null
              and (m.workspace_id = s.workspace_id or m.workspace_id = s.represented_by)));
end $$;
revoke all on function public.change_notice_recipients(text, text) from public;
grant execute on function public.change_notice_recipients(text, text) to anon, authenticated;
