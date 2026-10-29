-- Connexion obligatoire : fin de l'accès anonyme, comptes autorisés par email.

-- Emails autorisés : un compte créé avec l'un d'eux devient membre automatiquement.
create table private.allowed_emails (
  email text primary key
);

insert into private.allowed_emails (email) values ('jeanlescieux@gmail.com');

create or replace function private.add_member_if_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.allowed_emails a where lower(a.email) = lower(new.email)) then
    insert into public.members (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_add_member
  after insert on auth.users
  for each row execute function private.add_member_if_allowed();

-- Comptes déjà existants avec un email autorisé.
insert into public.members (user_id)
  select u.id from auth.users u join private.allowed_emails a on lower(a.email) = lower(u.email)
  on conflict do nothing;

-- Plus rien pour les visiteurs non connectés (règles restrictives, prioritaires sur l'accès ouvert de 0003 à 0007).
create policy "Connexion obligatoire" on public.exercises as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.templates as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.template_exercises as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.workouts as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.workout_sets as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.runs as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.runner_profile as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.performances as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.plan_sessions as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.coach_notes as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.coach_requests as restrictive for all to anon using (false) with check (false);
create policy "Connexion obligatoire" on public.coach_fire_log as restrictive for all to anon using (false) with check (false);
