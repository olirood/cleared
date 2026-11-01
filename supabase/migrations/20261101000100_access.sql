-- Cleared · acceso
-- 1. Crea los tres espacios iniciales.
-- 2. Invitaciones por correo: solo se puede crear la cuenta de un correo invitado,
--    y al crearse se le asignan sus espacios.
-- 3. Candado extra: una cuenta sin espacio no ve nada, ni el directorio compartido,
--    aunque por error se dejaran abiertos los registros públicos en Supabase.

-- ============ Espacios iniciales ============

insert into public.workspaces (name, slug, letter_template) values
  ('Apollo Music',    'apollo',  'apollo'),
  ('Kevin Cuadras',   'kevin',   'generic'),
  ('Octavio Cuadras', 'octavio', 'generic')
on conflict (slug) do nothing;

-- ============ Invitaciones ============

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces on delete cascade,
  email         citext not null,
  role          public.workspace_role not null default 'operator',
  display_name  text,
  invited_by    uuid references auth.users,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, email)
);

-- Convierte invitaciones pendientes en membresías para un usuario dado
create function public.apply_invitations(uid uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or mail is null then return; end if;
  insert into memberships (workspace_id, user_id, role, display_name)
  select i.workspace_id, uid, i.role, i.display_name
    from invitations i
   where i.email = mail::citext and i.accepted_at is null
  on conflict (workspace_id, user_id) do update
     set role = excluded.role,
         display_name = coalesce(excluded.display_name, memberships.display_name);
  update invitations set accepted_at = now()
   where email = mail::citext and accepted_at is null;
end $$;
revoke all on function public.apply_invitations(uuid, text) from public, anon, authenticated;

-- Portero: Supabase no puede crear una cuenta cuyo correo no tenga invitación,
-- ni desde el panel, ni con registro público, ni desde la API
create function public.gate_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (select 1 from invitations where email = new.email::citext) then
    raise exception 'Cleared: este correo no tiene invitación';
  end if;
  return new;
end $$;

create trigger cleared_gate_auth_user
  before insert on auth.users
  for each row execute function public.gate_auth_user();

-- Cuando Supabase crea la cuenta, se le asignan sus espacios
create function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform apply_invitations(new.id, new.email);
  return new;
end $$;

create trigger cleared_on_auth_user_created
  after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- Cuando se invita a alguien que ya tiene cuenta
create function public.on_invitation_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(new.email::text) limit 1;
  if uid is not null then perform apply_invitations(uid, new.email::text); end if;
  return new;
end $$;

create trigger cleared_on_invitation_created
  after insert on public.invitations
  for each row execute function public.on_invitation_created();

alter table public.invitations enable row level security;
-- solo los administradores del espacio ven e invitan
create policy inv_read on public.invitations for select to authenticated
  using (is_admin(workspace_id));
create policy inv_insert on public.invitations for insert to authenticated
  with check (is_admin(workspace_id) and invited_by = auth.uid());
create policy inv_delete on public.invitations for delete to authenticated
  using (is_admin(workspace_id) and accepted_at is null);

-- ============ Candado: sin espacio, nada ============

create function public.is_insider() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = auth.uid());
$$;

drop policy ws_read on public.workspaces;
create policy ws_read on public.workspaces for select to authenticated using (is_insider());

drop policy pub_read on public.publishers;
create policy pub_read on public.publishers for select to authenticated using (is_insider());

drop policy people_read on public.people;
create policy people_read on public.people for select to authenticated
  using ((shared and is_insider()) or is_member(owner_workspace_id) or is_member(represented_by));

drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using ((workspace_id is null and is_insider()) or is_member(workspace_id));

-- los visitantes sin sesión no tocan ninguna tabla
revoke all on all tables in schema public from anon;
