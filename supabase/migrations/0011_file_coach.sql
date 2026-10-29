-- File d'attente du coach : un message est « pris en charge » par une seule session (claimed_at),
-- et chaque session signale sa fin (finished_at) pour qu'un nouveau message relance le coach si besoin.
alter table public.coach_requests add column claimed_at timestamptz;
alter table public.coach_fire_log add column finished_at timestamptz;
