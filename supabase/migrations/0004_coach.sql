-- Coach de préparation course : profil et objectif, perfs, plan de séances, échanges avec le coach IA.

-- Profil coureur et objectif (une seule ligne) ------------------------------
create table public.runner_profile (
  id int primary key default 1 check (id = 1),
  race_name text not null default 'Movistar Madrid Medio Maratón',
  race_date date not null default '2027-04-04',
  race_distance_km numeric(7, 4) not null default 21.0975,
  goal_time_sec int check (goal_time_sec > 0),
  sessions_per_week int not null default 4 check (sessions_per_week between 2 and 7),
  -- Jours ISO : 1 = lundi … 7 = dimanche
  available_days int[] not null default '{2,4,6,7}',
  long_run_day int not null default 7 check (long_run_day between 1 and 7),
  current_weekly_km numeric(5, 1),
  longest_recent_run_km numeric(5, 1),
  constraints text,
  last_coach_review_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.runner_profile default values;

-- Performances de référence (courses, tests, sorties chronométrées) --------
create table public.performances (
  id uuid primary key default gen_random_uuid(),
  performed_on date not null default current_date,
  distance_km numeric(7, 4) not null check (distance_km > 0),
  time_sec int not null check (time_sec > 0),
  kind text not null default 'course' check (kind in ('course', 'test', 'entrainement')),
  notes text,
  created_at timestamptz not null default now()
);

create index performances_performed_on_idx on public.performances (performed_on desc);

-- Plan de séances ----------------------------------------------------------
create table public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  scheduled_on date not null,
  session_type text not null check (session_type in (
    'footing', 'sortie_longue', 'seuil', 'fractionne', 'allure_semi', 'cotes', 'recuperation', 'test', 'course'
  )),
  title text not null,
  description text,
  -- Étapes : [{ "label": "5 × 1 000 m", "repeat": 5, "distance_km": 1, "zone": "I", "recovery": "2 min trot" }, …]
  -- Zones : E endurance, S allure semi visée, T seuil, I intervalles, R vitesse, X récupération
  structure jsonb not null default '[]'::jsonb,
  target_distance_km numeric(5, 2),
  target_duration_min int,
  phase text check (phase in ('base', 'developpement', 'specifique', 'affutage', 'course')),
  week_number int,
  status text not null default 'prevue' check (status in ('prevue', 'faite', 'modifiee', 'sautee')),
  run_id uuid references public.runs (id) on delete set null,
  -- true : modifiée à la main, le coach ne la change plus sans demande
  locked boolean not null default false,
  source text not null default 'coach' check (source in ('coach', 'utilisateur')),
  coach_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_sessions_scheduled_on_idx on public.plan_sessions (scheduled_on);
create index plan_sessions_run_idx on public.plan_sessions (run_id);

-- Sorties réalisées : lien avec la séance prévue, ressenti -------------------
alter table public.runs add column planned_session_id uuid references public.plan_sessions (id) on delete set null;
alter table public.runs add column rpe int check (rpe between 1 and 10);
create index runs_planned_session_idx on public.runs (planned_session_id);

alter table public.runs drop constraint runs_run_type_check;
alter table public.runs add constraint runs_run_type_check check (run_type in (
  'endurance', 'loisir', 'sortie_longue', 'seuil', 'fractionne', 'tempo', 'allure_semi', 'cotes', 'recuperation', 'course'
));

-- Échanges avec le coach ----------------------------------------------------
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'conseil' check (kind in ('plan', 'bilan', 'reprogrammation', 'conseil')),
  title text not null,
  body text not null,
  read boolean not null default false
);

create index coach_notes_created_at_idx on public.coach_notes (created_at desc);

create table public.coach_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (length(message) between 1 and 2000),
  status text not null default 'en_attente' check (status in ('en_attente', 'traitee')),
  response text,
  handled_at timestamptz
);

-- Mise à jour automatique de updated_at -------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger runner_profile_touch before update on public.runner_profile
  for each row execute function private.touch_updated_at();
create trigger plan_sessions_touch before update on public.plan_sessions
  for each row execute function private.touch_updated_at();

-- Sécurité : mêmes règles que le reste (membres + accès ouvert temporaire) ---
alter table public.runner_profile enable row level security;
alter table public.performances enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_requests enable row level security;

grant select, update on public.runner_profile to authenticated, anon;
grant select, insert, update, delete on public.performances, public.plan_sessions,
  public.coach_notes, public.coach_requests to authenticated, anon;

create policy "Membres : profil" on public.runner_profile for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Membres : perfs" on public.performances for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Membres : plan" on public.plan_sessions for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Membres : notes du coach" on public.coach_notes for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Membres : demandes au coach" on public.coach_requests for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

create policy "Accès ouvert : profil" on public.runner_profile for all to anon using (true) with check (true);
create policy "Accès ouvert : perfs" on public.performances for all to anon using (true) with check (true);
create policy "Accès ouvert : plan" on public.plan_sessions for all to anon using (true) with check (true);
create policy "Accès ouvert : notes du coach" on public.coach_notes for all to anon using (true) with check (true);
create policy "Accès ouvert : demandes au coach" on public.coach_requests for all to anon using (true) with check (true);
