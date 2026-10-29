-- Commentaire sur une séance (« je pense que ce sera trop dur ? ») : une demande au coach liée à la séance.
alter table public.coach_requests
  add column session_id uuid references public.plan_sessions(id) on delete set null;

create index coach_requests_session_id_idx on public.coach_requests (session_id);

comment on column public.coach_requests.session_id is
  'Séance commentée : la demande a été écrite depuis cette séance.';
