-- Carnet d'entraînement : schéma, sécurité et données de départ.
-- Toutes les tables sont réservées aux comptes présents dans public.members.

-- Membres autorisés -------------------------------------------------------
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;

create policy "Un membre voit sa propre ligne"
  on public.members for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- Exercices ---------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint exercises_name_unique unique (name)
);

-- Modèles de séance -------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null default 0,
  target_sets int check (target_sets between 1 and 20),
  target_reps text
);

create index template_exercises_template_idx on public.template_exercises (template_id);
create index template_exercises_exercise_idx on public.template_exercises (exercise_id);

-- Séances de musculation --------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  performed_on date not null default current_date,
  title text,
  template_id uuid references public.templates (id) on delete set null,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index workouts_performed_on_idx on public.workouts (performed_on desc);
create index workouts_template_idx on public.workouts (template_id);
create index workouts_created_by_idx on public.workouts (created_by);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position int not null default 0,
  set_number int not null check (set_number >= 1),
  reps int not null check (reps between 0 and 500),
  weight_kg numeric(6, 2) not null default 0 check (weight_kg >= 0),
  rir int check (rir between 0 and 10)
);

create index workout_sets_workout_idx on public.workout_sets (workout_id);
create index workout_sets_exercise_idx on public.workout_sets (exercise_id);

-- Sorties de course -------------------------------------------------------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  performed_on date not null default current_date,
  run_type text not null default 'endurance'
    check (run_type in ('endurance', 'fractionne', 'tempo', 'sortie_longue', 'recuperation', 'course')),
  distance_km numeric(6, 2) not null check (distance_km > 0),
  duration_sec int not null check (duration_sec > 0),
  avg_hr int check (avg_hr between 30 and 250),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index runs_performed_on_idx on public.runs (performed_on desc);
create index runs_created_by_idx on public.runs (created_by);

-- Sécurité : accès complet pour les membres, rien pour les autres ----------
alter table public.exercises enable row level security;
alter table public.templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.runs enable row level security;

create policy "Membres : exercices" on public.exercises for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "Membres : modèles" on public.templates for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "Membres : contenu des modèles" on public.template_exercises for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "Membres : séances" on public.workouts for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "Membres : séries" on public.workout_sets for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "Membres : courses" on public.runs for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- Ping anti-pause (appelé tous les 3 jours par GitHub Actions) ------------
create or replace function public.keepalive()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

grant execute on function public.keepalive() to anon, authenticated;

-- Exercices de départ -----------------------------------------------------
insert into public.exercises (name, muscle_group) values
  ('Squat', 'Jambes'),
  ('Soulevé de terre', 'Dos'),
  ('Soulevé de terre roumain', 'Ischios'),
  ('Hip thrust', 'Fessiers'),
  ('Fentes', 'Jambes'),
  ('Presse à cuisses', 'Jambes'),
  ('Leg curl', 'Ischios'),
  ('Leg extension', 'Quadriceps'),
  ('Mollets debout', 'Mollets'),
  ('Abduction machine', 'Fessiers'),
  ('Développé couché', 'Pectoraux'),
  ('Développé incliné haltères', 'Pectoraux'),
  ('Développé militaire', 'Épaules'),
  ('Élévations latérales', 'Épaules'),
  ('Tractions', 'Dos'),
  ('Tirage vertical', 'Dos'),
  ('Rowing barre', 'Dos'),
  ('Rowing haltère', 'Dos'),
  ('Tirage horizontal', 'Dos'),
  ('Face pull', 'Épaules'),
  ('Curl biceps', 'Bras'),
  ('Extension triceps poulie', 'Bras');
