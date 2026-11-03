-- Cleared · representantes por persona, no por espacio
-- 1. workspace_reps(): cada espacio con las personas que lo operan, para mostrar "Oliver"
--    en vez de "Kevin Cuadras" y "Octavio Cuadras" por separado.
-- 2. Si quien representa a alguien es la misma gente que manda el split (p. ej. Oliver en
--    Kevin y en Octavio), no se pide aprobación: sería aprobarse a sí mismo.

create function public.workspace_reps() returns table (id uuid, name text, members text[], members_key text)
language sql stable security definer set search_path = public as $$
  select w.id, w.name,
         coalesce(array_agg(coalesce(nullif(m.display_name, ''), 'Sin nombre') order by m.user_id)
                  filter (where m.role in ('owner', 'admin', 'operator')), '{}'),
         coalesce(string_agg(m.user_id::text, ',' order by m.user_id)
                  filter (where m.role in ('owner', 'admin', 'operator')), '')
    from workspaces w left join memberships m on m.workspace_id = w.id
   where is_insider()
   group by w.id, w.name
   order by w.name;
$$;
revoke all on function public.workspace_reps() from public, anon;
grant execute on function public.workspace_reps() to authenticated;

create or replace function public.representing_workspaces(agreement uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct p.represented_by
  from split_participants sp
  join people p on p.id = sp.person_id
  join split_agreements a on a.id = sp.agreement_id
  join works w on w.id = a.work_id
  where sp.agreement_id = agreement
    and p.represented_by is not null
    and p.represented_by <> w.workspace_id
    -- solo si en el espacio representante hay alguien que no opera el espacio dueño
    and exists (
      select 1 from memberships m
       where m.workspace_id = p.represented_by and m.role in ('owner', 'admin', 'operator')
         and not exists (select 1 from memberships m2
                          where m2.workspace_id = w.workspace_id and m2.user_id = m.user_id
                            and m2.role in ('owner', 'admin', 'operator')));
$$;
