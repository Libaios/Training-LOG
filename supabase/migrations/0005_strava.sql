-- Import des sorties Strava par le coach : identifiant Strava pour éviter les doublons.
alter table public.runs add column source text not null default 'manuel' check (source in ('manuel', 'strava'));
alter table public.runs add column strava_activity_id bigint;
create unique index runs_strava_activity_idx on public.runs (strava_activity_id) where strava_activity_id is not null;
