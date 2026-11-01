-- Cleared · esquema inicial
-- Espacios de trabajo, directorio compartido, obras y grabaciones separadas,
-- splits versionados con aprobación entre espacios, firmas, label copy y bitácora.
-- Todas las tablas tienen RLS: cada quien ve lo de sus espacios, más los splits
-- donde participa alguien a quien su espacio representa.

create extension if not exists citext;

-- ============ Espacios y membresías ============

create table public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  letter_template text not null default 'generic',   -- 'apollo' usa la Songwriters' Split Letter con logo
  created_at    timestamptz not null default now()
);

create type public.workspace_role as enum ('owner', 'admin', 'operator', 'viewer');

create table public.memberships (
  workspace_id  uuid not null references public.workspaces on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  role          public.workspace_role not null default 'operator',
  display_name  text,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Funciones auxiliares (security definer para que las políticas no se llamen en círculo)
create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where workspace_id = ws and user_id = auth.uid());
$$;

create function public.can_write(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where workspace_id = ws and user_id = auth.uid()
                   and role in ('owner', 'admin', 'operator'));
$$;

create function public.is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where workspace_id = ws and user_id = auth.uid()
                   and role in ('owner', 'admin'));
$$;

-- ============ Directorio compartido ============

create table public.publishers (
  id            uuid primary key default gen_random_uuid(),
  owner_workspace_id uuid not null references public.workspaces,
  name          text not null,
  ipi           text check (ipi ~ '^\d{9,11}$'),
  email         citext,
  created_at    timestamptz not null default now()
);
create unique index publishers_ipi_key on public.publishers (ipi) where ipi is not null;

create table public.people (
  id            uuid primary key default gen_random_uuid(),
  owner_workspace_id uuid not null references public.workspaces,   -- quién lo dio de alta
  represented_by uuid references public.workspaces,                -- quién aprueba su parte en splits ajenos
  shared        boolean not null default true,                     -- visible para otros espacios
  legal_name    text not null,
  credit_name   text,
  nationality   text,
  email         citext,
  phone         text,
  kinds         text[] not null default '{songwriter}'
                check (kinds <@ array['songwriter','artist','producer','engineer','musician','visual']
                       and cardinality(kinds) > 0),
  instruments   text,
  isni          text,
  pro           text,              -- SACM, ASCAP, BMI…
  pro_member_no text,
  ipi           text check (ipi ~ '^\d{9,11}$'),
  publisher_id  uuid references public.publishers,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index people_ipi_key on public.people (ipi) where ipi is not null;
create index people_owner_idx on public.people (owner_workspace_id);
create index people_rep_idx on public.people (represented_by);

-- ============ Obras (composición) y grabaciones (máster) ============

create table public.works (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces,
  title         text not null,
  iswc          text,
  language      text,                 -- ISO 639-3
  lyrics        text,
  session_with  text,                 -- splits de sesión sin track
  session_date  date,
  studio        text,
  notes         text,
  created_by    uuid default auth.uid() references auth.users,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index works_ws_idx on public.works (workspace_id);

create table public.recordings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces,
  work_id       uuid references public.works on delete set null,   -- varias grabaciones, una obra
  title         text not null,
  version_title text,
  main_artist   text,
  featured_artists text,              -- separados con ;
  track_type    text not null default 'single' check (track_type in ('single','feat','cover','remix')),
  isrc          text check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}\d{7}$'),   -- sin guiones
  release_title text,
  release_type  text check (release_type in ('Sencillo','EP','Álbum')),
  release_date  date,
  label_name    text,
  distributor   text,
  genre         text,
  explicit      text not null default 'no' check (explicit in ('no','explicit','clean')),
  duration_s    int check (duration_s > 0),
  p_year int, p_owner text,
  c_year int, c_owner text,
  delivery_contact text,
  wfh_status     text not null default 'na' check (wfh_status in ('na','pending','signed')),
  waiver_status  text not null default 'na' check (waiver_status in ('na','pending','signed')),
  license_status text not null default 'na' check (license_status in ('na','pending','signed')),
  created_by    uuid default auth.uid() references auth.users,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index recordings_isrc_key on public.recordings (isrc) where isrc is not null;
create index recordings_ws_idx on public.recordings (workspace_id);

create table public.recording_codes (
  recording_id  uuid not null references public.recordings on delete cascade,
  format        text not null check (format in ('atmos','video','lyric','visualizer','karaoke','mastertone')),
  isrc          text check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}\d{7}$'),
  upc           text check (upc ~ '^\d{12,13}$'),
  primary key (recording_id, format)
);

create table public.credits (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid not null references public.recordings on delete cascade,
  category      text not null check (category in ('production','performer','visual')),
  role          text not null,         -- rol en inglés (Producer, Mixing Engineer…) o instrumento
  person_id     uuid references public.people,
  display_name  text,                  -- solo si no hay perfil
  detail        text,                  -- estudio y ciudad, nota
  performer_type text check (performer_type in ('main','featured','session')),
  position      int not null default 0,
  check (person_id is not null or display_name is not null)
);
create index credits_rec_idx on public.credits (recording_id);

create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid not null references public.recordings on delete cascade,
  kind          text not null check (kind in ('demo','mix','master','instrumental','cover','lyrics','atmos')),
  file_name     text not null,
  storage_key   text,                  -- ruta en R2; null si solo es un link externo
  external_url  text,
  size_bytes    bigint,
  sha256        text,
  uploaded_by   uuid default auth.uid() references auth.users,
  created_at    timestamptz not null default now()
);

-- ============ Splits ============

create table public.split_agreements (
  id            uuid primary key default gen_random_uuid(),
  work_id       uuid not null references public.works on delete cascade,
  version       int not null check (version > 0),
  status        text not null default 'draft' check (status in ('draft','sent','signed','void')),
  template      text,
  sent_at       timestamptz,
  completed_at  timestamptz,
  content_sha256 text,
  nom151_folio  text,
  nom151_issued_at timestamptz,
  created_by    uuid default auth.uid() references auth.users,
  created_at    timestamptz not null default now(),
  unique (work_id, version)
);
-- una sola versión vigente por obra
create unique index split_one_current on public.split_agreements (work_id) where status <> 'void';

create table public.split_participants (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.split_agreements on delete cascade,
  person_id     uuid not null references public.people,
  role          text not null check (role in ('songwriter','lyricist','composer','arranger')),
  share_bp      int not null check (share_bp between 1 and 10000),   -- 3333 = 33.33 %
  credits       text,
  snapshot      jsonb,          -- datos de la persona congelados al enviar
  position      int not null default 0,
  unique (agreement_id, person_id)
);

create table public.split_approvals (
  agreement_id  uuid not null references public.split_agreements on delete cascade,
  workspace_id  uuid not null references public.workspaces,
  status        text not null check (status in ('approved','changes_requested')),
  note          text,
  participants_sig text not null,   -- huella de participantes, rol y % al aprobar
  decided_by    uuid not null default auth.uid() references auth.users,
  decided_at    timestamptz not null default now(),
  primary key (agreement_id, workspace_id)
);

create table public.signatures (
  id            uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.split_participants on delete cascade,
  token_hash    text not null unique,   -- solo la huella del link, nunca el link
  status        text not null default 'pending' check (status in ('pending','signed','void')),
  expires_at    timestamptz not null default now() + interval '30 days',
  signed_at     timestamptz,
  method        text,
  consent_version text,
  ip            inet,
  user_agent    text
);

create table public.change_requests (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.split_agreements on delete cascade,
  participant_id uuid references public.split_participants on delete cascade,
  note          text not null,
  created_at    timestamptz not null default now()
);

-- ============ Bitácora (solo se agrega) ============

create table public.audit_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid references public.workspaces,
  entity        text not null,
  entity_id     uuid,
  action        text not null,
  detail        jsonb,
  actor         uuid default auth.uid(),
  at            timestamptz not null default now()
);
create index audit_entity_idx on public.audit_events (entity, entity_id);

-- ============ Reglas de negocio ============

-- huella de participantes: cambia si cambia alguien, su rol o su %
create function public.participants_sig(agreement uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(person_id::text || ':' || role || ':' || share_bp, '|' order by person_id), '')
  from split_participants where agreement_id = agreement;
$$;

-- espacios que representan a alguien del split, sin contar al dueño de la obra
create function public.representing_workspaces(agreement uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct p.represented_by
  from split_participants sp
  join people p on p.id = sp.person_id
  join split_agreements a on a.id = sp.agreement_id
  join works w on w.id = a.work_id
  where sp.agreement_id = agreement
    and p.represented_by is not null
    and p.represented_by <> w.workspace_id;
$$;

create function public.represents_someone_in(agreement uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from representing_workspaces(agreement) r where is_member(r));
$$;

create function public.can_see_work(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from works where id = w and is_member(workspace_id))
      or exists (select 1 from split_agreements a where a.work_id = w and a.status <> 'void'
                 and represents_someone_in(a.id));
$$;

-- no se envía a firma si no suma 100 % o si falta una aprobación vigente
create function public.check_split_before_send() returns trigger
language plpgsql security definer set search_path = public as $$
declare total int; pending int;
begin
  if new.status = 'sent' and old.status = 'draft' then
    select coalesce(sum(share_bp), 0) into total from split_participants where agreement_id = new.id;
    if total <> 10000 then
      raise exception 'El split suma % puntos base; debe sumar 10000', total;
    end if;
    select count(*) into pending
    from representing_workspaces(new.id) r
    where not exists (select 1 from split_approvals ap
                      where ap.agreement_id = new.id and ap.workspace_id = r
                        and ap.status = 'approved'
                        and ap.participants_sig = participants_sig(new.id));
    if pending > 0 then
      raise exception 'Faltan % aprobaciones de representantes', pending;
    end if;
    new.sent_at := now();
  end if;
  if old.status in ('sent','signed','void') and new.status = 'draft' then
    raise exception 'Un split enviado no vuelve a borrador: crea una versión nueva';
  end if;
  return new;
end $$;
create trigger split_before_send before update on public.split_agreements
  for each row execute function public.check_split_before_send();

-- los participantes solo se editan en borrador
create function public.lock_participants() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from split_agreements
   where id = coalesce(new.agreement_id, old.agreement_id);
  if st <> 'draft' and tg_op <> 'UPDATE' then
    raise exception 'El split ya se envió; crea una versión nueva';
  end if;
  if st <> 'draft' and tg_op = 'UPDATE'
     and (new.person_id, new.role, new.share_bp) is distinct from (old.person_id, old.role, old.share_bp) then
    raise exception 'El split ya se envió; crea una versión nueva';
  end if;
  return coalesce(new, old);
end $$;
create trigger participants_locked before insert or update or delete on public.split_participants
  for each row execute function public.lock_participants();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger people_touch before update on public.people for each row execute function public.touch_updated_at();
create trigger works_touch before update on public.works for each row execute function public.touch_updated_at();
create trigger recordings_touch before update on public.recordings for each row execute function public.touch_updated_at();

-- ============ Seguridad por fila (RLS) ============

alter table public.workspaces        enable row level security;
alter table public.memberships       enable row level security;
alter table public.publishers        enable row level security;
alter table public.people            enable row level security;
alter table public.works             enable row level security;
alter table public.recordings        enable row level security;
alter table public.recording_codes   enable row level security;
alter table public.credits           enable row level security;
alter table public.assets            enable row level security;
alter table public.split_agreements  enable row level security;
alter table public.split_participants enable row level security;
alter table public.split_approvals   enable row level security;
alter table public.signatures        enable row level security;
alter table public.change_requests   enable row level security;
alter table public.audit_events      enable row level security;

-- espacios: los míos, más los que aparecen como representantes en el directorio (solo nombre)
create policy ws_read on public.workspaces for select to authenticated using (true);
create policy ws_admin on public.workspaces for update to authenticated using (is_admin(id));

create policy mem_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or is_member(workspace_id));
create policy mem_admin on public.memberships for all to authenticated
  using (is_admin(workspace_id)) with check (is_admin(workspace_id));

-- directorio: compartido entre espacios; solo edita quien lo creó o lo representa
create policy pub_read on public.publishers for select to authenticated using (true);
create policy pub_write on public.publishers for insert to authenticated with check (can_write(owner_workspace_id));
create policy pub_update on public.publishers for update to authenticated using (can_write(owner_workspace_id));

create policy people_read on public.people for select to authenticated
  using (shared or is_member(owner_workspace_id) or is_member(represented_by));
create policy people_insert on public.people for insert to authenticated
  with check (can_write(owner_workspace_id));
create policy people_update on public.people for update to authenticated
  using (can_write(owner_workspace_id) or can_write(represented_by));
create policy people_delete on public.people for delete to authenticated
  using (is_admin(owner_workspace_id));

-- obras: mi espacio, o lectura si represento a alguien en su split vigente
create policy works_read on public.works for select to authenticated
  using (is_member(workspace_id) or can_see_work(id));
create policy works_write on public.works for insert to authenticated with check (can_write(workspace_id));
create policy works_update on public.works for update to authenticated using (can_write(workspace_id));
create policy works_delete on public.works for delete to authenticated using (is_admin(workspace_id));

-- grabaciones y label copy: solo el espacio dueño
create policy rec_all on public.recordings for all to authenticated
  using (is_member(workspace_id)) with check (can_write(workspace_id));
create policy codes_all on public.recording_codes for all to authenticated
  using (exists (select 1 from recordings r where r.id = recording_id and is_member(r.workspace_id)))
  with check (exists (select 1 from recordings r where r.id = recording_id and can_write(r.workspace_id)));
create policy credits_all on public.credits for all to authenticated
  using (exists (select 1 from recordings r where r.id = recording_id and is_member(r.workspace_id)))
  with check (exists (select 1 from recordings r where r.id = recording_id and can_write(r.workspace_id)));
create policy assets_all on public.assets for all to authenticated
  using (exists (select 1 from recordings r where r.id = recording_id and is_member(r.workspace_id)))
  with check (exists (select 1 from recordings r where r.id = recording_id and can_write(r.workspace_id)));

-- splits: los ve quien ve la obra; solo el dueño los edita
create policy split_read on public.split_agreements for select to authenticated using (can_see_work(work_id));
create policy split_write on public.split_agreements for insert to authenticated
  with check (exists (select 1 from works w where w.id = work_id and can_write(w.workspace_id)));
create policy split_update on public.split_agreements for update to authenticated
  using (exists (select 1 from works w where w.id = work_id and can_write(w.workspace_id)));

create policy part_read on public.split_participants for select to authenticated
  using (exists (select 1 from split_agreements a where a.id = agreement_id and can_see_work(a.work_id)));
create policy part_write on public.split_participants for all to authenticated
  using (exists (select 1 from split_agreements a join works w on w.id = a.work_id
                 where a.id = agreement_id and can_write(w.workspace_id)))
  with check (exists (select 1 from split_agreements a join works w on w.id = a.work_id
                      where a.id = agreement_id and can_write(w.workspace_id)));

-- aprobaciones: cada espacio representante escribe solo la suya
create policy appr_read on public.split_approvals for select to authenticated
  using (exists (select 1 from split_agreements a where a.id = agreement_id and can_see_work(a.work_id)));
create policy appr_write on public.split_approvals for insert to authenticated
  with check (can_write(workspace_id)
              and workspace_id in (select representing_workspaces(agreement_id))
              and participants_sig = participants_sig(agreement_id)
              and decided_by = auth.uid());
create policy appr_update on public.split_approvals for update to authenticated
  using (can_write(workspace_id))
  with check (can_write(workspace_id)
              and participants_sig = participants_sig(agreement_id)
              and decided_by = auth.uid());

-- firmas y cambios: lectura para quien ve el split; las escribe solo el servidor (firmante sin cuenta)
create policy sig_read on public.signatures for select to authenticated
  using (exists (select 1 from split_participants sp join split_agreements a on a.id = sp.agreement_id
                 where sp.id = participant_id and can_see_work(a.work_id)));
create policy cr_read on public.change_requests for select to authenticated
  using (exists (select 1 from split_agreements a where a.id = agreement_id and can_see_work(a.work_id)));

-- bitácora: lectura para miembros; se escribe solo desde el servidor o con triggers
create policy audit_read on public.audit_events for select to authenticated
  using (workspace_id is null or is_member(workspace_id));

-- el link de firma nunca se expone, ni a miembros: se quita el permiso de tabla
-- y se devuelve columna por columna, sin token_hash
revoke all on public.signatures from anon, authenticated;
grant select (id, participant_id, status, expires_at, signed_at, method, consent_version)
  on public.signatures to authenticated;
