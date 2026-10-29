-- Séances à jour libre : à faire n'importe quel jour de leur semaine (lundi → dimanche).
-- Elles sont rangées au dimanche de leur semaine (scheduled_on), qui sert aussi de date limite.
-- Les séances à date fixe (la course, ou une séance placée à la main) gardent flexible = false.
alter table public.plan_sessions add column flexible boolean not null default true;

comment on column public.plan_sessions.flexible is
  'Jour libre : à faire dans la semaine (lundi → dimanche) qui contient scheduled_on, rangée au dimanche de cette semaine.';

update public.plan_sessions set flexible = false where session_type = 'course';

update public.plan_sessions
set scheduled_on = date_trunc('week', scheduled_on)::date + 6
where flexible and scheduled_on <> date_trunc('week', scheduled_on)::date + 6;

-- Plus de jours imposés : tous les jours sont possibles.
update public.runner_profile set available_days = '{1,2,3,4,5,6,7}' where id = 1;
