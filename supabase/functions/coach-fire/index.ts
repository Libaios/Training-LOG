// Lance le coach IA « à la demande » quand un message est envoyé depuis l'appli.
// Secrets Supabase :
// - CLAUDE_COACH_TOKEN : jeton de la tâche « Coach semi Madrid : à la demande (API) » (jamais dans l'appli)
// - CLAUDE_COACH_FIRE_URL : facultatif (sinon, l'adresse de la tâche ci-dessous)
//
// File d'attente : un message « en_attente » non pris en charge (claimed_at vide, ou vieux de plus
// de 10 min) attend une session. Si une session tourne encore (finished_at vide, et elle a pris un
// message dans les 3 min après son lancement), elle le prendra avant de finir : on ne relance pas.
// Une session qui n'a rien pris en 3 min, ou qui tourne depuis plus de 6 min, ne bloque plus : on en lance une autre
// (les messages déjà pris restent à elle pendant 10 min, les nouveaux vont à la nouvelle session).
// Seuls les comptes connectés autorisés peuvent créer des messages ; sans message en attente, rien ne part.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01QK1a2dXLj2toqoPBoTetvJ/fire'
const STALE_MS = 10 * 60 * 1000
const ALIVE_MS = 6 * 60 * 1000
const STARTUP_MS = 3 * 60 * 1000
const MIN_GAP_MS = 20 * 1000
const MAX_PER_HOUR = 20

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
  const staleIso = new Date(Date.now() - STALE_MS).toISOString()

  // Messages qui attendent une session : pas encore pris en charge, ou pris par une session qui a lâché.
  const { data: pending, error: pendingError } = await db
    .from('coach_requests')
    .select('message')
    .eq('status', 'en_attente')
    .or(`claimed_at.is.null,claimed_at.lt.${staleIso}`)
    .order('created_at', { ascending: true })
    .limit(20)
  if (pendingError) return json({ status: 'error', message: pendingError.message }, 500)
  const count = pending?.length ?? 0
  if (!count) return json({ status: 'nothing_pending' })

  // Une session encore en cours prendra ces messages avant de finir.
  const { data: last } = await db
    .from('coach_fire_log')
    .select('fired_at,finished_at,session_url')
    .eq('status', 'ok')
    .order('fired_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last) {
    const age = Date.now() - new Date(last.fired_at).getTime()
    if (age < MIN_GAP_MS) return json({ status: 'already_running', session_url: last.session_url })
    if (!last.finished_at && age < ALIVE_MS) {
      // Vivante si elle a pris un message depuis son lancement, ou si elle démarre encore.
      const { count: claimed } = await db
        .from('coach_requests')
        .select('id', { count: 'exact', head: true })
        .gte('claimed_at', last.fired_at)
      if (age < STARTUP_MS || (claimed ?? 0) > 0) {
        return json({ status: 'already_running', session_url: last.session_url })
      }
    }
  }

  // Garde-fou : la tâche accepte 30 lancements par heure.
  const { count: lastHour } = await db
    .from('coach_fire_log')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ok')
    .gte('fired_at', new Date(Date.now() - 3600 * 1000).toISOString())
  if ((lastHour ?? 0) >= MAX_PER_HOUR) return json({ status: 'rate_limited' })

  const res = await fetch(fireUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    // Le texte des messages sert de titre et de contexte à la session ; la base reste la référence.
    body: JSON.stringify({
      text: [`${count} message(s) en attente dans l'appli :`, ...pending!.map((r) => `- ${r.message}`)]
        .join('\n')
        .slice(0, 6000),
    }),
  })
  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = `${res.status} ${body?.error?.message ?? ''}`.slice(0, 500)
    await db.from('coach_fire_log').insert({ status: 'error', error: message })
    if (res.status === 429) return json({ status: 'rate_limited' })
    return json({ status: 'error', code: res.status }, 502)
  }

  await db.from('coach_fire_log').insert({ status: 'ok', session_url: body.claude_code_session_url ?? null })
  return json({ status: 'fired', session_url: body.claude_code_session_url ?? null })
})
