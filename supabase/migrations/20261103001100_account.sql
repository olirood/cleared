-- Cleared · tu cuenta: nombre visible y color del círculo de la inicial
-- Cada persona edita lo suyo (en todos sus espacios a la vez); no toca rol ni espacios.

alter table public.memberships add column avatar_color text
  check (avatar_color is null or avatar_color ~ '^#[0-9A-Fa-f]{6}$');

create function public.set_my_account(display_name text, avatar_color text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := nullif(btrim(set_my_account.display_name), '');
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if n is null or length(n) > 40 then raise exception 'Tu nombre debe tener entre 1 y 40 caracteres'; end if;
  if set_my_account.avatar_color is not null and set_my_account.avatar_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Color no válido';
  end if;
  update memberships m set display_name = n, avatar_color = set_my_account.avatar_color
   where m.user_id = auth.uid();
end $$;
revoke all on function public.set_my_account(text, text) from public, anon;
grant execute on function public.set_my_account(text, text) to authenticated;
