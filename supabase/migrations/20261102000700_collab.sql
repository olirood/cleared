-- Cleared · tipo de track "Colaboración" (dos o más artistas principales)
alter table public.recordings drop constraint recordings_track_type_check;
alter table public.recordings add constraint recordings_track_type_check
  check (track_type in ('single', 'collab', 'feat', 'cover', 'remix'));
