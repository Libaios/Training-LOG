-- Sort la fonction de contrôle d'accès de l'API publique (schéma non exposé).
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_member()
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

revoke execute on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

alter policy "Membres : exercices" on public.exercises
  using ((select private.is_member())) with check ((select private.is_member()));
alter policy "Membres : modèles" on public.templates
  using ((select private.is_member())) with check ((select private.is_member()));
alter policy "Membres : contenu des modèles" on public.template_exercises
  using ((select private.is_member())) with check ((select private.is_member()));
alter policy "Membres : séances" on public.workouts
  using ((select private.is_member())) with check ((select private.is_member()));
alter policy "Membres : séries" on public.workout_sets
  using ((select private.is_member())) with check ((select private.is_member()));
alter policy "Membres : courses" on public.runs
  using ((select private.is_member())) with check ((select private.is_member()));

drop function public.is_member();
