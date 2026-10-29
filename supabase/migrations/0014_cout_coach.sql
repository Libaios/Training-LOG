-- Coût de chaque appel à l'API du coach (en dollars), pour le plafond mensuel et le suivi.
alter table public.coach_api_log add column cost_usd numeric(8, 4);
update public.coach_api_log
set cost_usd = round(((coalesce(input_tokens, 0) * 4 + coalesce(output_tokens, 0) * 20
  + coalesce(cache_write_tokens, 0) * 5 + coalesce(cache_read_tokens, 0) * 0.2) / 1000000.0)::numeric, 4)
where model = 'claude-opus-5-5' and cost_usd is null;
