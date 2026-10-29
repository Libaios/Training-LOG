// Lance le coach IA « à la demande » quand une demande est envoyée depuis l'onglet Coach.
// Secret Supabase : CLAUDE_COACH_TOKEN (jeton de la tâche « Coach semi Madrid : à la demande (API) »).
// CLAUDE_COACH_FIRE_URL est facultatif (sinon, l'adresse de cette tâche). Le jeton n'est jamais dans l'appli.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01QK1a2dXLj2toqoPBoTetvJ/fire'
const MIN_INTERVAL_MS = 2 * 60 * 1000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ status: 'method_not_allowed' }, 405)

  const token = Deno.env.get('CLAUDE_COACH_TOKEN')
  const fireUrl = (Deno.env.get('CLAUDE_COACH_FIRE_URL') || DEFAULT_FIRE_URL).trim()
  if (!token || !fireUrl.startsWith('https://api.anthropic.com/')) return json({ status: 'not_configured' })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Rien à lancer sans demande en attente : l'appel seul ne déclenche rien.
  const { count, error: countError } = await db
    .from('coach_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'en_attente')
  if (countError) return json({ status: 'error', message: countError.message }, 500)
  if (!count) return json({ status: 'nothing_pending' })

  // Un lancement toutes les 2 minutes au plus : le coach en cours traite aussi les demandes arrivées entre-temps.
  const { data: last } = await db
    .from('coach_fire_log')
    .select('fired_at,status,session_url')
    .eq('status', 'ok')
    .order('fired_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last && Date.now() - new Date(last.fired_at).getTime() < MIN_INTERVAL_MS) {
    return json({ status: 'already_running', session_url: last.session_url })
  }

  const res = await fetch(fireUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: `${count} demande(s) en attente dans l'appli.` }),
  })
  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = `${res.status} ${body?.error?.message ?? ''}`.slice(0, 500)
    await db.from('coach_fire_log').insert({ status: 'error', error: message })
    return json({ status: 'error', code: res.status }, 502)
  }

  await db.from('coach_fire_log').insert({ status: 'ok', session_url: body.claude_code_session_url ?? null })
  return json({ status: 'fired', session_url: body.claude_code_session_url ?? null })
})
