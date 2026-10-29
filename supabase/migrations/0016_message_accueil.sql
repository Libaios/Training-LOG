-- Message d'accueil : une phrase du coach en haut de l'écran Aujourd'hui, réécrite chaque soir par la revue.
alter table public.runner_profile add column home_message text check (length(home_message) <= 200);
alter table public.runner_profile add column home_message_at timestamptz;

comment on column public.runner_profile.home_message is
  'Phrase d''accueil écrite par la revue du soir pour le lendemain (une phrase, vraie toute la journée).';
