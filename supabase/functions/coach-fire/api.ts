// Réponses du coach par l'API Messages : prend en charge les messages en attente, construit le dossier,
// laisse le modèle répondre et ajuster le plan avec des outils bornés (jamais une sortie, une perf,
// une séance faite ou verrouillée), puis écrit la réponse dans coach_requests.
// Secret Supabase : ANTHROPIC_API_KEY. Facultatif : COACH_MODEL, COACH_EFFORT, COACH_DAILY_LIMIT.
import {
  buildDossier,
  isIsoDate,
  parisMidnightUtc,
  SESSION_COLUMNS,
  sessionText,
  todayParis,
  weekMonday,
  weekSunday,
  type Db,
  type Session,
  type Step,
} from './dossier.ts'

const MODEL = Deno.env.get('COACH_MODEL') || 'claude-opus-5-5'
const EFFORT = Deno.env.get('COACH_EFFORT') || 'medium'
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') || 30)
const STALE_MS = 10 * 60 * 1000
const BUDGET_MS = 125 * 1000 // la fonction a 150 s au plus
const MAX_TURNS = 8
const MAX_ATTEMPTS = 2 // ensuite le message est laissé à la session Claude Code
const RULES_URL = 'https://raw.githubusercontent.com/Libaios/Training-LOG/main/coach/COACH.md'

export type Claimed = { id: string; created_at: string; message: string; session_id: string | null }
export type ApiOutcome = { answered: number; transmitted: number; limited: boolean; failed: number }

// Règles du coach : coach/COACH.md du repo (toujours à jour), gardées 10 min en mémoire. ---------
let rulesCache: { text: string; at: number } | null = null
async function coachRules(): Promise<string> {
  if (rulesCache && Date.now() - rulesCache.at < 10 * 60 * 1000) return rulesCache.text
  try {
    const res = await fetch(RULES_URL, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const text = await res.text()
      if (text.length > 500) {
        rulesCache = { text, at: Date.now() }
        return text
      }
    }
  } catch {
    /* repo injoignable : on garde l'ancienne copie ou les consignes de base */
  }
  return rulesCache?.text ?? ''
}

const INSTRUCTIONS = `Tu es le coach course de l’appli « Carnet d’entraînement ». Le coureur vient d’écrire un message dans l’appli et attend ta réponse tout de suite. Il ne voit que ta réponse (et la note si tu en écris une). Personne ne validera rien : ne pose pas de question pour gagner du temps, agis.

Tu as en dessous le guide complet du coach (coach/COACH.md). Suis ses sections 1 (format d’une séance), 2 (principes), 4.4 à 4.6 (allures et ressenti, demandes, écriture) et 5 (ton : un vrai coach exigeant). Ignore ce qu’il dit des requêtes SQL, de last_coach_review_at et de la note du soir : ici tu agis uniquement avec tes outils, et la note du soir reste le rôle de la revue du soir.

Comment traiter le message :
1. Lis le dossier (niveau, allures cibles, plan, sorties, derniers échanges). Un message est souvent la suite d’un échange précédent (« oui vas-y », « comme je t’ai dit ») : relis les derniers échanges.
2. Message écrit depuis une séance (« Sur la séance « … » : ») : réponds sur cette séance précisément. Si elle est adaptée, maintiens-la et pousse-le à la faire (« Tu la fais. ») ; n’allège que sur un vrai signal (douleur, fatigue qui s’accumule, allures non tenues plusieurs fois, maladie). Tu peux modifier cette séance même si elle est verrouillée : son commentaire vaut accord.
3. Si le message le justifie, ajuste les séances à venir avec les outils (jamais une séance faite, passée ou verrouillée, sauf la séance commentée ; une séance passée non faite peut seulement passer en « sautée » si le message le dit). Séances à jour libre : tu donnes la semaine, jamais un jour. Mets une consigne (coach_comment) courte sur chaque séance changée.
4. Si le plan a changé, ajoute une note (une seule) dans repondre : ce qui a changé et pourquoi, 2 à 4 lignes.
5. Termine toujours par l’outil repondre : 1 à 3 phrases (jusqu’à 5 si la question le demande vraiment), texte simple sur un seul paragraphe, sans markdown, sans liste, sans tiret cadratin. Tutoiement, concret : chiffres, semaines, allures cibles du dossier (jamais de fourchette). Plus un titre de 3 à 7 mots qui résume la demande et son issue.
6. Douleur (au pied en particulier) : jamais forcer. Remplace la qualité par du footing ou du repos, réduis le volume, avis médical si ça dure.
7. Tu peux changer l’objectif de temps ou le nombre de séances par semaine seulement si le message le demande clairement (outil modifier_profil). Tu ne touches jamais aux sorties ni aux perfs.

Appelle transmettre_au_developpeur, sans rien modifier ni répondre, si le message parle, même en partie, de l’appli elle-même (écran, couleur, affichage, bouton, bug, nouvelle fonction, nouvelle donnée), ou s’il demande de reconstruire tout le plan (plus d’une quinzaine de séances à changer). Une session plus longue s’en charge.

Ne renvoie jamais le coureur vers une autre conversation ou un autre outil : tu es son coach et tu fais ce qu’il demande.`

// Outils -------------------------------------------------------------------------------------
const TYPES = ['footing', 'recuperation', 'sortie_longue', 'seuil', 'fractionne', 'allure_semi', 'cotes', 'test', 'course']
const PHASES = ['base', 'developpement', 'specifique', 'affutage', 'course']
const ZONES = ['X', 'E', 'S', 'T', 'I', 'R']

const stepSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'ex. « Échauffement », « 6 × 800 m »' },
    repeat: { type: 'integer', minimum: 1, maximum: 40 },
    distance_km: { type: 'number', description: 'distance d’une répétition, ou de l’étape' },
    duration_min: { type: 'number' },
    zone: { type: 'string', enum: ZONES },
    recovery: { type: 'string', description: 'ex. « 2 min trot »' },
  },
  required: ['label'],
}

const sessionFields = {
  session_type: { type: 'string', enum: TYPES },
  title: { type: 'string', description: 'court : « 6 × 800 m », « Sortie longue 14 km »' },
  description: { type: 'string', description: '1 à 2 phrases, facultatif' },
  structure: { type: 'array', items: stepSchema, description: 'étapes de la séance, zones sans allure en dur' },
  target_distance_km: { type: 'number', description: 'total, échauffement compris' },
  target_duration_min: { type: 'integer' },
  coach_comment: { type: 'string', description: 'consigne ou justification courte, affichée sous la séance' },
  phase: { type: 'string', enum: PHASES },
}

const TOOLS = [
  {
    name: 'lire_seances',
    description: 'Lit le détail des séances du plan entre deux dates (le dossier ne détaille que les 5 prochaines semaines).',
    input_schema: {
      type: 'object',
      properties: { du: { type: 'string', description: 'AAAA-MM-JJ' }, au: { type: 'string', description: 'AAAA-MM-JJ' } },
      required: ['du', 'au'],
    },
  },
  {
    name: 'modifier_seances',
    description:
      'Modifie une ou plusieurs séances existantes. Seuls les champs donnés changent. « semaine » (une date de la semaine voulue) déplace une séance à jour libre dans cette semaine. « statut » : sautee pour une séance non faite que le coureur ne fera pas, prevue pour la remettre.',
    input_schema: {
      type: 'object',
      properties: {
        changements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              ...sessionFields,
              semaine: { type: 'string', description: 'AAAA-MM-JJ, n’importe quel jour de la semaine visée' },
              statut: { type: 'string', enum: ['prevue', 'sautee'] },
            },
            required: ['id'],
          },
        },
      },
      required: ['changements'],
    },
  },
  {
    name: 'ajouter_seances',
    description: 'Ajoute une ou plusieurs séances à jour libre, chacune dans une semaine (rangée au dimanche de cette semaine).',
    input_schema: {
      type: 'object',
      properties: {
        seances: {
          type: 'array',
          items: {
            type: 'object',
            properties: { semaine: { type: 'string', description: 'AAAA-MM-JJ, n’importe quel jour de la semaine visée' }, ...sessionFields },
            required: ['semaine', 'session_type', 'title', 'structure'],
          },
        },
      },
      required: ['seances'],
    },
  },
  {
    name: 'supprimer_seances',
    description: 'Supprime des séances à venir (non faites, non verrouillées). Pour une séance que le coureur ne fera pas, préfère statut = sautee.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
  },
  {
    name: 'modifier_profil',
    description: 'Seulement si le message le demande clairement : objectif de temps (secondes) ou nombre de séances par semaine.',
    input_schema: {
      type: 'object',
      properties: {
        goal_time_sec: { type: 'integer', description: 'objectif en secondes (ex. 6600 pour 1:50:00), 0 pour l’effacer' },
        sessions_per_week: { type: 'integer', minimum: 2, maximum: 7 },
      },
    },
  },
  {
    name: 'repondre',
    description: 'Termine : enregistre la réponse affichée au coureur, son titre court, et la note si le plan a changé.',
    input_schema: {
      type: 'object',
      properties: {
        reponse: { type: 'string', description: '1 à 3 phrases, un seul paragraphe, sans markdown' },
        titre: { type: 'string', description: '3 à 7 mots : la demande et son issue' },
        note: {
          type: 'object',
          description: 'seulement si le plan a changé',
          properties: { titre: { type: 'string' }, texte: { type: 'string', description: '2 à 4 lignes' } },
          required: ['titre', 'texte'],
        },
      },
      required: ['reponse', 'titre'],
    },
  },
  {
    name: 'transmettre_au_developpeur',
    description: 'Message qui parle de l’appli elle-même, ou refonte complète du plan : laissé à une session plus longue. Ne réponds pas et ne modifie rien.',
    input_schema: { type: 'object', properties: { raison: { type: 'string' } }, required: ['raison'] },
  },
]

type Ctx = {
  db: Db
  request: Claimed
  today: string
  raceDate: string
  firstMonday: string | null
  changed: boolean
  /** Des changements demandés ont été refusés pendant ce tour. */
  refused: boolean
}

class ToolError extends Error {}

function cleanSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw) || !raw.length) throw new ToolError('structure : liste d’étapes non vide attendue')
  return raw.slice(0, 20).map((s, i) => {
    if (!s || typeof s !== 'object' || typeof (s as Step).label !== 'string' || !(s as Step).label.trim())
      throw new ToolError(`étape ${i + 1} : label manquant`)
    const x = s as Record<string, unknown>
    const step: Step = { label: String(x.label).trim().slice(0, 60) }
    if (Number.isInteger(x.repeat) && (x.repeat as number) >= 1 && (x.repeat as number) <= 40) step.repeat = x.repeat as number
    if (typeof x.distance_km === 'number' && x.distance_km > 0 && x.distance_km <= 42.2) step.distance_km = x.distance_km
    if (typeof x.duration_min === 'number' && x.duration_min > 0 && x.duration_min <= 300) step.duration_min = x.duration_min
    if (typeof x.zone === 'string' && ZONES.includes(x.zone)) step.zone = x.zone
    if (typeof x.recovery === 'string' && x.recovery.trim()) step.recovery = x.recovery.trim().slice(0, 60)
    return step
  })
}

/** Champs communs d'une séance, validés. */
function cleanFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.session_type !== undefined) {
    if (!TYPES.includes(String(input.session_type)) || input.session_type === 'course') throw new ToolError('session_type invalide')
    out.session_type = input.session_type
  }
  if (input.title !== undefined) {
    const t = String(input.title).trim()
    if (!t) throw new ToolError('titre vide')
    out.title = t.slice(0, 80)
  }
  if (input.description !== undefined) out.description = String(input.description).trim().slice(0, 400) || null
  if (input.structure !== undefined) out.structure = cleanSteps(input.structure)
  if (input.target_distance_km !== undefined) {
    const d = Number(input.target_distance_km)
    if (!(d > 0 && d <= 45)) throw new ToolError('target_distance_km invalide')
    out.target_distance_km = Math.round(d * 100) / 100
  }
  if (input.target_duration_min !== undefined) {
    const d = Math.round(Number(input.target_duration_min))
    out.target_duration_min = d > 0 && d <= 300 ? d : null
  }
  if (input.coach_comment !== undefined) out.coach_comment = String(input.coach_comment).trim().slice(0, 400) || null
  if (input.phase !== undefined) {
    if (!PHASES.includes(String(input.phase))) throw new ToolError('phase invalide')
    out.phase = input.phase
  }
  return out
}

const weekNumber = (ctx: Ctx, sunday: string) =>
  ctx.firstMonday ? Math.floor((Date.parse(weekMonday(sunday)) - Date.parse(ctx.firstMonday)) / (7 * 86400000)) + 1 : null

function checkWeek(ctx: Ctx, date: unknown): string {
  if (!isIsoDate(date)) throw new ToolError('semaine : date AAAA-MM-JJ attendue')
  const sunday = weekSunday(date)
  if (sunday < weekSunday(ctx.today)) throw new ToolError('semaine déjà passée')
  if (weekMonday(date) > ctx.raceDate) throw new ToolError('semaine après la course')
  return sunday
}

async function loadSessions(ctx: Ctx, ids: string[]): Promise<Map<string, Session>> {
  const { data, error } = await ctx.db.from('plan_sessions').select(SESSION_COLUMNS).in('id', ids)
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as Session[]).map((s) => [s.id, s]))
}

/** Une séance est encore à venir si sa date (ou le dimanche de sa semaine) n'est pas passée. */
const isFuture = (ctx: Ctx, s: Session) => s.scheduled_on >= ctx.today

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<string> {
  const db = ctx.db
  if (name === 'lire_seances') {
    if (!isIsoDate(input.du) || !isIsoDate(input.au)) throw new ToolError('dates AAAA-MM-JJ attendues')
    const { data, error } = await db
      .from('plan_sessions')
      .select(SESSION_COLUMNS)
      .gte('scheduled_on', input.du)
      .lte('scheduled_on', input.au)
      .order('scheduled_on')
      .limit(60)
    if (error) throw new Error(error.message)
    const list = (data ?? []) as Session[]
    return list.length ? list.map((s) => sessionText(s)).join('\n') : 'Aucune séance sur cette période.'
  }

  if (name === 'modifier_seances') {
    const changes = Array.isArray(input.changements) ? (input.changements as Record<string, unknown>[]) : []
    if (!changes.length) throw new ToolError('aucun changement')
    const byId = await loadSessions(ctx, changes.map((c) => String(c.id)))
    const done: string[] = []
    const refused: string[] = []
    for (const c of changes.slice(0, 30)) {
      const s = byId.get(String(c.id))
      try {
        if (!s) throw new ToolError('séance introuvable')
        if (s.status === 'faite') throw new ToolError('déjà faite')
        if (s.locked && s.id !== ctx.request.session_id) throw new ToolError('verrouillée par le coureur')
        const patch: Record<string, unknown> = {}
        if (!isFuture(ctx, s)) {
          if (c.statut !== 'sautee' || Object.keys(c).some((k) => !['id', 'statut', 'coach_comment'].includes(k)))
            throw new ToolError('séance passée : seul statut = sautee est possible')
          patch.status = 'sautee'
          if (c.coach_comment !== undefined) patch.coach_comment = String(c.coach_comment).slice(0, 400) || null
        } else {
          if (s.session_type === 'course') throw new ToolError('la course ne se modifie pas')
          Object.assign(patch, cleanFields(c))
          if (c.semaine !== undefined) {
            if (!s.flexible) throw new ToolError('séance à date fixe : elle ne se déplace pas')
            const sunday = checkWeek(ctx, c.semaine)
            patch.scheduled_on = sunday
            patch.week_number = weekNumber(ctx, sunday)
          }
          if (c.statut !== undefined) {
            if (!['prevue', 'sautee'].includes(String(c.statut))) throw new ToolError('statut invalide')
            patch.status = c.statut
          }
        }
        if (!Object.keys(patch).length) throw new ToolError('rien à changer')
        const { error } = await db.from('plan_sessions').update(patch).eq('id', s.id).neq('status', 'faite')
        if (error) throw new Error(error.message)
        done.push(`« ${patch.title ?? s.title} »`)
      } catch (e) {
        if (!(e instanceof ToolError)) throw e
        refused.push(`[${c.id}] ${e.message}`)
      }
    }
    if (done.length) ctx.changed = true
    if (refused.length) ctx.refused = true
    return [done.length ? `Modifiées : ${done.join(', ')}.` : '', refused.length ? `Refusées : ${refused.join(' ; ')}.` : '']
      .filter(Boolean)
      .join(' ')
  }

  if (name === 'ajouter_seances') {
    const list = Array.isArray(input.seances) ? (input.seances as Record<string, unknown>[]) : []
    if (!list.length) throw new ToolError('aucune séance')
    const rows: Record<string, unknown>[] = []
    for (const [i, x] of list.slice(0, 30).entries()) {
      try {
        const sunday = checkWeek(ctx, x.semaine)
        const fields = cleanFields(x)
        if (!fields.session_type || !fields.title || !fields.structure) throw new ToolError('session_type, title et structure requis')
        if (!fields.phase) {
          const { data } = await db.from('plan_sessions').select('phase').eq('scheduled_on', sunday).not('phase', 'is', null).limit(1).maybeSingle()
          fields.phase = data?.phase ?? null
        }
        rows.push({ ...fields, scheduled_on: sunday, flexible: true, week_number: weekNumber(ctx, sunday), status: 'prevue', source: 'coach', locked: false })
      } catch (e) {
        if (!(e instanceof ToolError)) throw e
        throw new ToolError(`séance ${i + 1} : ${e.message} (rien n’a été ajouté)`)
      }
    }
    const { data, error } = await db.from('plan_sessions').insert(rows).select('id,title,scheduled_on')
    if (error) throw new Error(error.message)
    ctx.changed = true
    return `Ajoutées : ${(data ?? []).map((s) => `[${s.id}] « ${s.title} » (semaine du ${weekMonday(s.scheduled_on)})`).join(', ')}.`
  }

  if (name === 'supprimer_seances') {
    const ids = Array.isArray(input.ids) ? (input.ids as unknown[]).map(String).slice(0, 30) : []
    if (!ids.length) throw new ToolError('aucun id')
    const byId = await loadSessions(ctx, ids)
    const ok: string[] = []
    const refused: string[] = []
    for (const id of ids) {
      const s = byId.get(id)
      const why = !s
        ? 'introuvable'
        : s.status === 'faite' || s.run_id
          ? 'déjà faite'
          : s.locked && s.id !== ctx.request.session_id
            ? 'verrouillée par le coureur'
            : s.session_type === 'course'
              ? 'c’est la course'
              : !isFuture(ctx, s)
                ? 'passée (utilise statut = sautee)'
                : null
      if (why) refused.push(`[${id}] ${why}`)
      else ok.push(id)
    }
    if (ok.length) {
      const { error } = await db.from('plan_sessions').delete().in('id', ok).neq('status', 'faite').is('run_id', null)
      if (error) throw new Error(error.message)
      ctx.changed = true
    }
    if (refused.length) ctx.refused = true
    return [ok.length ? `Supprimées : ${ok.map((id) => `« ${byId.get(id)!.title} »`).join(', ')}.` : '', refused.length ? `Refusées : ${refused.join(' ; ')}.` : '']
      .filter(Boolean)
      .join(' ')
  }

  if (name === 'modifier_profil') {
    const patch: Record<string, unknown> = {}
    if (input.goal_time_sec !== undefined) {
      const g = Number(input.goal_time_sec)
      if (g !== 0 && !(Number.isInteger(g) && g >= 3600 && g <= 4 * 3600)) throw new ToolError('objectif invalide (entre 1 h et 4 h, en secondes)')
      patch.goal_time_sec = g || null
    }
    if (input.sessions_per_week !== undefined) {
      const n = Number(input.sessions_per_week)
      if (!(Number.isInteger(n) && n >= 2 && n <= 7)) throw new ToolError('séances par semaine : 2 à 7')
      patch.sessions_per_week = n
    }
    if (!Object.keys(patch).length) throw new ToolError('rien à changer')
    const { error } = await db.from('runner_profile').update(patch).eq('id', 1)
    if (error) throw new Error(error.message)
    ctx.changed = true
    return 'Profil mis à jour (les allures de l’appli se recalculent toutes seules).'
  }

  throw new ToolError(`outil inconnu : ${name}`)
}

// Appel de l'API ---------------------------------------------------------------------------------
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }
type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }

async function callApi(apiKey: string, body: Record<string, unknown>, timeoutMs: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`API ${res.status} ${data?.error?.type ?? ''} ${data?.error?.message ?? ''}`.trim().slice(0, 500))
  return data as { content: Block[]; stop_reason: string; usage: Record<string, number> }
}

type Result = { kind: 'repondu'; reponse: string; titre: string | null; note?: { titre: string; texte: string } } | { kind: 'transmis'; raison: string }

/** Traite un message : dossier, échanges avec le modèle et ses outils, jusqu'à repondre ou transmettre. */
async function handleOne(db: Db, apiKey: string, request: Claimed, deadline: number, usage: Usage): Promise<Result> {
  const [dossier, rules] = await Promise.all([buildDossier(db, { excludeRequestIds: [request.id] }), coachRules()])
  const ctx: Ctx = { db, request, today: dossier.today, raceDate: dossier.raceDate, firstMonday: dossier.firstMonday, changed: false, refused: false }

  let focus = ''
  if (request.session_id) {
    const { data } = await db.from('plan_sessions').select(SESSION_COLUMNS).eq('id', request.session_id).maybeSingle()
    focus = data
      ? `\n\nSéance commentée (tu peux la modifier même si elle est verrouillée) :\n${sessionText(data as Session)}`
      : '\n\n(La séance commentée n’existe plus.)'
  }

  const system = [
    { type: 'text', text: `${INSTRUCTIONS}\n\n# Guide du coach (coach/COACH.md)\n\n${rules || '(guide indisponible : suis les consignes ci-dessus)'}`, cache_control: { type: 'ephemeral' } },
  ]
  const messages: { role: string; content: unknown }[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `# Dossier\n\n${dossier.text}` },
        {
          type: 'text',
          text: `# Message du coureur (envoyé ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(request.created_at))})\n\n${request.message}${focus}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
    },
  ]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const left = deadline - Date.now()
    if (left < 10000) throw new Error('temps écoulé')
    const res = await callApi(apiKey, { model: MODEL, max_tokens: 16000, system, tools: TOOLS, messages, output_config: { effort: EFFORT } }, left)
    usage.input += res.usage?.input_tokens ?? 0
    usage.output += res.usage?.output_tokens ?? 0
    usage.cacheRead += res.usage?.cache_read_input_tokens ?? 0
    usage.cacheWrite += res.usage?.cache_creation_input_tokens ?? 0

    const calls = res.content.filter((b) => b.type === 'tool_use')
    if (!calls.length) {
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ').trim()
      if (res.stop_reason === 'end_turn' && text) return { kind: 'repondu', reponse: text, titre: null }
      throw new Error(`réponse inattendue (${res.stop_reason})`)
    }

    messages.push({ role: 'assistant', content: res.content })
    const results: Record<string, unknown>[] = []
    let final: Result | null = null
    for (const call of calls) {
      const input = call.input ?? {}
      if (call.name === 'repondre') {
        const reponse = String(input.reponse ?? '').trim()
        if (!reponse) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'reponse vide', is_error: true })
          continue
        }
        const note = input.note as { titre?: string; texte?: string } | undefined
        final = {
          kind: 'repondu',
          reponse: reponse.slice(0, 2000),
          titre: String(input.titre ?? '').trim().slice(0, 80) || null,
          note: note?.titre && note?.texte ? { titre: String(note.titre).slice(0, 120), texte: String(note.texte).slice(0, 1500) } : undefined,
        }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'ok' })
      } else if (call.name === 'transmettre_au_developpeur') {
        if (ctx.changed) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Le plan a déjà été modifié : réponds avec repondre.', is_error: true })
          continue
        }
        final = { kind: 'transmis', raison: String(input.raison ?? '') }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'ok' })
      } else {
        try {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: await runTool(ctx, call.name ?? '', input) })
        } catch (e) {
          if (!(e instanceof ToolError)) throw e
          ctx.refused = true
          results.push({ type: 'tool_result', tool_use_id: call.id, content: e.message, is_error: true })
        }
      }
    }
    // Une réponse écrite en même temps qu'un changement refusé annoncerait un changement qui n'a pas eu lieu.
    if (final?.kind === 'repondu' && ctx.refused) {
      const i = calls.findIndex((c) => c.name === 'repondre')
      results[i] = { type: 'tool_result', tool_use_id: calls[i].id, content: 'Non enregistrée : un changement a été refusé (voir les autres résultats). Corrige, puis rappelle repondre.', is_error: true }
      final = null
    }
    ctx.refused = false
    if (final) return final
    messages.push({ role: 'user', content: results })
  }
  throw new Error('trop d’allers-retours')
}

// File d'attente -------------------------------------------------------------------------------
/** Prend en charge les messages qui n'ont pas encore été vus par l'API (ou abandonnés depuis 10 min). */
export async function claimForApi(db: Db): Promise<Claimed[]> {
  const stale = new Date(Date.now() - STALE_MS).toISOString()
  const { data, error } = await db
    .from('coach_requests')
    .update({ claimed_at: new Date().toISOString() })
    .eq('status', 'en_attente')
    .is('handler', null)
    .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
    .select('id,created_at,message,session_id')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Claimed[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function usedToday(db: Db): Promise<number> {
  const { count } = await db
    .from('coach_api_log')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'reponse')
    .in('outcome', ['repondu', 'transmis'])
    .gte('created_at', parisMidnightUtc(todayParis()))
  return count ?? 0
}

/** Libère des messages pris en charge (ils seront repris au prochain lancement). */
async function release(db: Db, ids: string[]) {
  if (ids.length) await db.from('coach_requests').update({ claimed_at: null }).in('id', ids).eq('status', 'en_attente')
}

/** Répond aux messages pris en charge, puis à ceux arrivés entre-temps, dans le temps imparti. */
export async function answerClaimed(db: Db, apiKey: string, first: Claimed[], started = Date.now()): Promise<ApiOutcome> {
  const deadline = started + BUDGET_MS
  const outcome: ApiOutcome = { answered: 0, transmitted: 0, limited: false, failed: 0 }
  let queue = first
  while (queue.length) {
    for (let i = 0; i < queue.length; i++) {
      const r = queue[i]
      if (deadline - Date.now() < 30000 || (await usedToday(db)) >= DAILY_LIMIT) {
        if (deadline - Date.now() >= 30000) outcome.limited = true
        await release(db, queue.slice(i).map((q) => q.id))
        return outcome
      }
      const t0 = Date.now()
      const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      const log = (o: string, error?: string) =>
        db.from('coach_api_log').insert({
          request_id: r.id,
          mode: 'reponse',
          outcome: o,
          model: MODEL,
          input_tokens: usage.input,
          output_tokens: usage.output,
          cache_read_tokens: usage.cacheRead,
          cache_write_tokens: usage.cacheWrite,
          duration_ms: Date.now() - t0,
          error: error ?? null,
        })
      try {
        const res = await handleOne(db, apiKey, r, deadline, usage)
        if (res.kind === 'repondu') {
          const { error } = await db
            .from('coach_requests')
            .update({ response: res.reponse, summary: res.titre, status: 'traitee', handled_at: new Date().toISOString(), handler: 'api' })
            .eq('id', r.id)
            .eq('status', 'en_attente')
          if (error) throw new Error(error.message)
          if (res.note) await db.from('coach_notes').insert({ kind: 'reprogrammation', title: res.note.titre, body: res.note.texte })
          outcome.answered++
          await log('repondu')
        } else {
          await db.from('coach_requests').update({ handler: 'session', claimed_at: null }).eq('id', r.id).eq('status', 'en_attente')
          outcome.transmitted++
          await log('transmis', res.raison.slice(0, 300))
        }
      } catch (e) {
        outcome.failed++
        const message = e instanceof Error ? e.message : String(e)
        await log(message === 'temps écoulé' ? 'abandon' : 'erreur', message)
        // Après deux échecs, le message passe à la session Claude Code (ou à la revue du soir).
        const { count } = await db
          .from('coach_api_log')
          .select('id', { count: 'exact', head: true })
          .eq('request_id', r.id)
          .in('outcome', ['erreur', 'abandon'])
        if ((count ?? 0) >= MAX_ATTEMPTS) await db.from('coach_requests').update({ handler: 'session', claimed_at: null }).eq('id', r.id).eq('status', 'en_attente')
        else await release(db, [r.id])
      }
    }
    queue = deadline - Date.now() > 30000 ? await claimForApi(db) : []
  }
  return outcome
}
