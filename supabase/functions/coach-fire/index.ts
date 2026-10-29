// Coach à la demande : appelée par l'appli quand un message est envoyé, et chaque minute par pg_cron
// (relance-coach) tant qu'un message attend.
//
// 1. Avec le secret ANTHROPIC_API_KEY : les messages sont traités par l'API (api.ts), en quelques secondes.
//    Corps { "wait": true } (envoi depuis l'appli) : la réponse est écrite avant le retour.
//    Sinon (relance) : prise en charge immédiate, réponse écrite en arrière-plan.
//    Ce qui demande une vraie réflexion, ou touche l'appli elle-même, passe en handler = 'session'.
// 2. Session Claude Code (secrets CLAUDE_COACH_TOKEN et, si besoin, CLAUDE_COACH_FIRE_URL) : lancée pour
//    les messages handler = 'session' (ou pour tous les messages sans clé API). File d'attente :
//    une session encore en cours (finished_at vide, qui a pris un message dans les 3 min après son
//    lancement) les prendra avant de finir ; une session qui n'a rien pris en 3 min, ou qui tourne depuis
//    plus de 6 min, ne bloque plus. Message abandonné repris après 10 min.
// Seuls les comptes connectés autorisés peuvent créer des messages ; sans message en attente, rien ne part.
// Global fourni par le runtime Supabase (évite de dépendre de jsr.io au déploiement).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }
import { createClient } from 'npm:@supabase/supabase-js@2'
import { answerClaimed, claimForApi, usedToday, type ApiOutcome } from './api.ts'
import type { Db } from './dossier.ts'

const DEFAULT_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01QK1a2dXLj2toqoPBoTetvJ/fire'
const STALE_MS = 10 * 60 * 1000
const ALIVE_MS = 6 * 60 * 1000
const STARTUP_MS = 3 * 60 * 1000
const MIN_GAP_MS = 20 * 1000
const MAX_PER_HOUR = 20
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') || 30)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Réponses par l'API. Renvoie un statut pour l'appli, ou null s'il n'y avait rien pour l'API. */
async function viaApi(db: Db, apiKey: string, wait: boolean): Promise<string | null> {
  const started = Date.now()
  if ((await usedToday(db)) >= DAILY_LIMIT) {
    const { count } = await db
      .from('coach_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'en_attente')
      .is('handler', null)
    // L'ancienne version de l'appli ne connaît pas daily_limit : « réponse ce soir » dit la même chose.
    return count ? (wait ? 'daily_limit' : 'not_configured') : null
  }
  const claimed = await claimForApi(db)
  if (!claimed.length) return null
  const job = answerClaimed(db, apiKey, claimed, started).catch((e) => {
    console.error('coach api', e)
    return { answered: 0, transmitted: 0, limited: false, failed: claimed.length } as ApiOutcome
  })
  if (!wait) {
    EdgeRuntime.waitUntil(job)
    return 'fired'
  }
  const out = await job
  if (out.answered) return 'answered'
  if (out.limited) return 'daily_limit'
  if (out.transmitted) return null // la session Claude Code prend le relais
  return 'error'
}

/** Lance la session Claude Code pour les messages qui lui reviennent. */
async function viaSession(db: Db, onlySession: boolean): Promise<string> {
  const token = Deno.env.get('CLAUDE_COACH_TOKEN')
  const fireUrl = (Deno.env.get('CLAUDE_COACH_FIRE_URL') || DEFAULT_FIRE_URL).trim()
  const staleIso = new Date(Date.now() - STALE_MS).toISOString()

  // Messages qui attendent une session : pas encore pris en charge, ou pris par une session qui a lâché.
  let query = db
    .from('coach_requests')
    .select('message')
    .eq('status', 'en_attente')
    .or(`claimed_at.is.null,claimed_at.lt.${staleIso}`)
  if (onlySession) query = query.eq('handler', 'session')
  const { data: pending, error: pendingError } = await query.order('created_at', { ascending: true }).limit(20)
  if (pendingError) throw new Error(pendingError.message)
  const count = pending?.length ?? 0
  if (!count) return 'nothing_pending'
  if (!token || !fireUrl.startsWith('https://api.anthropic.com/')) return 'not_configured'

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
    if (age < MIN_GAP_MS) return 'already_running'
    if (!last.finished_at && age < ALIVE_MS) {
      // Vivante si elle a pris un message depuis son lancement, ou si elle démarre encore.
      const { count: claimed } = await db
        .from('coach_requests')
        .select('id', { count: 'exact', head: true })
        .gte('claimed_at', last.fired_at)
      if (age < STARTUP_MS || (claimed ?? 0) > 0) return 'already_running'
    }
  }

  // Garde-fou : la tâche accepte 30 lancements par heure.
  const { count: lastHour } = await db
    .from('coach_fire_log')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ok')
    .gte('fired_at', new Date(Date.now() - 3600 * 1000).toISOString())
  if ((lastHour ?? 0) >= MAX_PER_HOUR) return 'rate_limited'

  const res = await fetch(fireUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    // Le texte des messages sert de titre et de contexte à la session ; la base reste la référence.
    body: JSON.stringify({
      text: [`${count} message(s) en attente dans l'appli :`, ...pending!.map((r) => `- ${r.message}`)].join('\n').slice(0, 6000),
    }),
  })
  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = `${res.status} ${body?.error?.message ?? ''}`.slice(0, 500)
    await db.from('coach_fire_log').insert({ status: 'error', error: message })
    return res.status === 429 ? 'rate_limited' : 'error'
  }

  await db.from('coach_fire_log').insert({ status: 'ok', session_url: body.claude_code_session_url ?? null })
  return 'fired'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ status: 'method_not_allowed' }, 405)

  const input = await req.json().catch(() => ({}))
  const wait = input?.wait === true
  const db: Db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

  try {
    const apiStatus = apiKey ? await viaApi(db, apiKey, wait) : null
    const sessionStatus = await viaSession(db, Boolean(apiKey))
    // Un message d'appli vient d'être confié à la session : c'est son statut qui compte pour l'appli.
    if (sessionStatus !== 'nothing_pending' && (!apiStatus || apiStatus === 'error')) return json({ status: sessionStatus })
    return json({ status: apiStatus ?? sessionStatus })
  } catch (e) {
    console.error('coach-fire', e)
    return json({ status: 'error' }, 500)
  }
})
