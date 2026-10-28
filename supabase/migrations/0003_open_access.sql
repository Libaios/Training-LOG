-- Accès sans compte (temporaire) : le rôle anon reçoit les mêmes droits que les membres.
-- Pour revenir à l'accès par compte : exécuter le bloc « Retour aux comptes » en bas de fichier,
-- puis remettre "requireAuth": true dans app.config.json et republier.

grant select, insert, update, delete on public.exercises, public.templates, public.template_exercises,
  public.workouts, public.workout_sets, public.runs to anon;

create policy "Accès ouvert : exercices" on public.exercises for all to anon using (true) with check (true);
create policy "Accès ouvert : modèles" on public.templates for all to anon using (true) with check (true);
create policy "Accès ouvert : contenu des modèles" on public.template_exercises for all to anon using (true) with check (true);
create policy "Accès ouvert : séances" on public.workouts for all to anon using (true) with check (true);
create policy "Accès ouvert : séries" on public.workout_sets for all to anon using (true) with check (true);
create policy "Accès ouvert : courses" on public.runs for all to anon using (true) with check (true);

/* Retour aux comptes :
drop policy "Accès ouvert : exercices" on public.exercises;
drop policy "Accès ouvert : modèles" on public.templates;
drop policy "Accès ouvert : contenu des modèles" on public.template_exercises;
drop policy "Accès ouvert : séances" on public.workouts;
drop policy "Accès ouvert : séries" on public.workout_sets;
drop policy "Accès ouvert : courses" on public.runs;
revoke all on public.exercises, public.templates, public.template_exercises,
  public.workouts, public.workout_sets, public.runs from anon;
*/
