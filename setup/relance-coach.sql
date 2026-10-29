-- Facultatif, à lancer soi-même dans le SQL Editor de Supabase :
-- relance le coach côté serveur, même appli fermée. Chaque minute, s'il reste un message en attente
-- non pris en charge (ou abandonné depuis 10 min), on appelle coach-fire, qui ne lance une session que si besoin.
-- Pour l'arrêter : select cron.unschedule('relance-coach');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'relance-coach',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zmiazoekdvdwoqqdysse.supabase.co/functions/v1/coach-fire',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.coach_requests
    where status = 'en_attente'
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
      and created_at < now() - interval '1 minute'
  )
  $$
);
