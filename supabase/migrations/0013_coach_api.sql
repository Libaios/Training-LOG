-- Réponses du coach par l'API (fonction coach-fire) : qui traite chaque message, et journal des appels.

-- api : répondu par l'API ; session : laissé à la session Claude Code (modification de l'appli,
-- refonte complète du plan, ou échecs répétés de l'API). Vide : pas encore vu.
alter table public.coach_requests add column handler text check (handler in ('api', 'session'));

comment on column public.coach_requests.handler is
  'api : répondu par l''API (coach-fire) ; session : laissé à la session Claude Code ; vide : pas encore vu.';

-- Journal des appels à l'API : coût (jetons), durée, erreurs. Écrit uniquement par les fonctions serveur.
create table public.coach_api_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid references public.coach_requests (id) on delete set null,
  mode text not null default 'reponse' check (mode in ('reponse', 'revue')),
  outcome text not null check (outcome in ('repondu', 'transmis', 'erreur', 'abandon')),
  model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,
  duration_ms int,
  error text
);

create index coach_api_log_created_at_idx on public.coach_api_log (created_at desc);
create index coach_api_log_request_idx on public.coach_api_log (request_id);

alter table public.coach_api_log enable row level security;

revoke all on public.coach_api_log from anon, authenticated;
grant select on public.coach_api_log to authenticated;

create policy "Membres : appels du coach" on public.coach_api_log for select to authenticated
  using ((select private.is_member()));
create policy "Connexion obligatoire" on public.coach_api_log as restrictive for all to anon
  using (false) with check (false);
