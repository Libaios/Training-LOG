// Lance le coach IA « à la demande » quand une demande est envoyée depuis l'onglet Coach.
// Secrets Supabase :
// - CLAUDE_COACH_TOKEN : jeton de la tâche « Coach semi Madrid : à la demande (API) » (jamais dans l'appli)
// - APP_CHANGE_CODE : code à saisir pour demander une modification de l'appli
// - CLAUDE_COACH_FIRE_URL : facultatif (sinon, l'adresse de la tâche ci-dessous)
//
// Corps facultatif : { kind: 'appli', message, code } pour une demande de modification de l'appli.
// Les demandes d'entraînement sont créées par l'appli elle-même avant l'appel.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01QK1a2dXLj2toqoPBoTetvJ/fire'
const MIN_INTERVAL_MS = 60 * 1000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Comparaison en temps constant, pour ne rien laisser deviner du code. */
function sameCode(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ status: 'method_not_allowed' }, 405)

  const token = Deno.env.get('CLAUDE_COACH_TOKEN')
  const fireUrl = (Deno.env.get('CLAUDE_COACH_FIRE_URL') || DEFAULT_FIRE_URL).trim()
  if (!token || !fireUrl.startsWith('https://api.anthropic.com/')) return json({ status: 'not_configured' })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Demande de modification de l'appli : seulement avec le bon code.
  const input = await req.json().catch(() => ({}))
  if (input?.kind === 'appli') {
    const expected = Deno.env.get('APP_CHANGE_CODE')
    if (!expected) return json({ status: 'no_app_code' })
    const message = String(input.message ?? '').trim()
    if (!message || message.length > 2000) return json({ status: 'error', message: 'Message vide ou trop long.' }, 400)
    if (!sameCode(String(input.code ?? ''), expected)) {
      // Ralentit les essais au hasard.
      await new Promise((r) => setTimeout(r, 1500))
      return json({ status: 'bad_code' }, 403)
    }
    const { error: insertError } = await db.from('coach_requests').insert({ message, kind: 'appli' })
    if (insertError) return json({ status: 'error', message: insertError.message }, 500)
  }

  // Rien à lancer sans demande en attente : l'appel seul ne déclenche rien.
  const { count, error: countError } = await db
    .from('coach_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'en_attente')
  if (countError) return json({ status: 'error', message: countError.message }, 500)
  if (!count) return json({ status: 'nothing_pending' })

  // Un lancement par minute au plus : le coach en cours traite aussi les demandes arrivées entre-temps.
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
