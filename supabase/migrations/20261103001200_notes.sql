-- Cleared · mis pendientes: notas personales en el inicio (cada quien ve solo las suyas)

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 500),
  due_on     date,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notes_user_idx on public.notes (user_id, done_at, created_at);
alter table public.notes enable row level security;
create policy notes_own on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notes from anon;
