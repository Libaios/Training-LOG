-- Demandes de modification de l'appli : type « appli », créées seulement par la fonction coach-fire
-- après vérification du code secret (APP_CHANGE_CODE). Les visiteurs anonymes ne peuvent créer
-- que des demandes d'entraînement, et ne peuvent ni modifier ni supprimer les demandes.
alter table public.coach_requests add column kind text not null default 'coach' check (kind in ('coach', 'appli'));

create policy "Accès ouvert : seulement des demandes d'entraînement" on public.coach_requests
  as restrictive for insert to anon
  with check (kind = 'coach' and status = 'en_attente' and response is null and handled_at is null);
create policy "Accès ouvert : pas de modification des demandes" on public.coach_requests
  as restrictive for update to anon
  using (false) with check (false);
create policy "Accès ouvert : pas de suppression des demandes" on public.coach_requests
  as restrictive for delete to anon
  using (false);
