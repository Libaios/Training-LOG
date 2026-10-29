-- Nombre de sessions longues lancées pour un message : sert à le reprendre par l'API (mode relais)
-- quand la session s'arrête sans répondre, et à ne pas relancer sans fin.
alter table public.coach_requests add column session_tries int not null default 0;

comment on column public.coach_requests.session_tries is
  'Sessions longues lancées pour ce message. Sans réponse 10 min après la prise en charge (ou après deux lancements sans prise en charge), l''API répond en mode relais.';
