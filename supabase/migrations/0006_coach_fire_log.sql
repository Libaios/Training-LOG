-- Journal des lancements du coach à la demande (depuis l'onglet Coach de l'appli).
create table public.coach_fire_log (
  id uuid primary key default gen_random_uuid(),
  fired_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'error')),
  session_url text,
  error text
);

create index coach_fire_log_fired_at_idx on public.coach_fire_log (fired_at desc);

alter table public.coach_fire_log enable row level security;

-- Lecture seule pour l'appli ; seules les fonctions serveur (clé secrète) écrivent.
grant select on public.coach_fire_log to authenticated, anon;
create policy "Membres : lancements du coach" on public.coach_fire_log for select to authenticated
  using ((select private.is_member()));
create policy "Accès ouvert : lancements du coach" on public.coach_fire_log for select to anon using (true);
