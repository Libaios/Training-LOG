// Réponses du coach par l'API Messages : prend en charge les messages en attente, construit le dossier,
// laisse le modèle répondre et ajuster le plan avec des outils bornés (jamais une sortie, une perf,
// une séance faite ou verrouillée), puis écrit la réponse dans coach_requests.
// Budget : tri par Haiku, puis Sonnet sans réflexion préalable pour les réponses rapides ; ce qui demande une vraie réflexion part à
// la session longue (abonnement Claude, pas les crédits API). Au-delà de 80 % du budget du mois, Haiku prend le relais.
// Secret Supabase : ANTHROPIC_API_KEY. Facultatif : COACH_MODEL, COACH_EFFORT, COACH_DAILY_LIMIT, COACH_MONTHLY_BUDGET_USD.
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

const MODEL = Deno.env.get('COACH_MODEL') || 'claude-sonnet-5-5'
const CHEAP_MODEL = 'claude-haiku-5-5'
const EFFORT = Deno.env.get('COACH_EFFORT') || 'medium'
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') || 30)
const MONTHLY_BUDGET_USD = Number(Deno.env.get('COACH_MONTHLY_BUDGET_USD') || 5.4) // 5 €

// Prix en dollars par million de jetons : entrée, sortie, écriture du cache (5 min), lecture du cache.
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.1],
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
}
export const costOf = (model: string, u: Usage) => {
  const [i, o, w, r] = PRICES[model] ?? PRICES['claude-opus-5-5']
  return (u.input * i + u.output * o + u.cacheWrite * w + u.cacheRead * r) / 1e6 + u.extraUsd
}

/** Dépense du mois en cours (heure de Paris), d'après le journal des appels. */
export async function monthSpend(db: Db): Promise<number> {
  const firstDay = `${todayParis().slice(0, 8)}01`
  const { data } = await db.from('coach_api_log').select('cost_usd').gte('created_at', parisMidnightUtc(firstDay))
  return (data ?? []).reduce((s: number, r: { cost_usd: number | null }) => s + Number(r.cost_usd ?? 0), 0)
}

/** Pas de réflexion préalable (moins de jetons) : ce qui demande de réfléchir part à la session longue. */
const thinkingFor = (model: string) =>
  model.startsWith('claude-sonnet') ? { thinking: { type: 'between_tools' } } : model.startsWith('claude-haiku') ? { thinking: { type: 'disabled' } } : {}

// Tri préalable par Haiku (presque gratuit, ne lit que le message) : ce qui demande de réfléchir part
// directement à la session longue, sans payer la lecture du dossier par Sonnet.
const TRIAGE = `Tu tries les messages qu’un coureur envoie à son coach dans une appli d’entraînement. Réponds par un seul mot.
RAPIDE si une réponse courte suffit : question sur une séance ou une allure, doute, motivation, ressenti, douleur, petit ajustement d’une ou deux séances.
CLAUDE s’il faut vraiment réfléchir ou beaucoup modifier : plus de deux séances ou une semaine entière à changer, revoir la progression, l’objectif ou la structure du plan, analyse détaillée, question en plusieurs parties, ou message qui parle, même en partie, de l’appli elle-même (écran, affichage, bouton, bug, nouvelle fonction).
En cas de doute : RAPIDE.`

async function triage(db: Db, apiKey: string, request: Claimed, deadline: number): Promise<{ toSession: boolean; costUsd: number }> {
  const { data } = await db
    .from('coach_requests')
    .select('message,response')
    .eq('status', 'traitee')
    .not('response', 'is', null)
    .order('handled_at', { ascending: false })
    .limit(2)
  const prev = ((data ?? []) as { message: string; response: string }[])
    .reverse()
    .map((e) => `Coureur : ${e.message.slice(0, 300)}\nCoach : ${e.response.slice(0, 300)}`)
    .join('\n')
  const res = await callApi(
    apiKey,
    {
      model: CHEAP_MODEL,
      max_tokens: 10,
      system: TRIAGE,
      messages: [{ role: 'user', content: `${prev ? `Derniers échanges :\n${prev}\n\n` : ''}Message à trier :\n${request.message}` }],
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    },
    Math.min(15000, deadline - Date.now()),
  )
  const answer = res.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').toUpperCase()
  const used: Usage = { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0, cacheRead: 0, cacheWrite: 0, extraUsd: 0 }
  return { toSession: answer.includes('CLAUDE'), costUsd: costOf(CHEAP_MODEL, used) }
}

/** Sonnet tant que le budget du mois le permet, Haiku au-delà de 80 %. */
export async function pickModel(db: Db): Promise<string> {
  return (await monthSpend(db)) >= MONTHLY_BUDGET_USD * 0.8 ? CHEAP_MODEL : MODEL
}

const STALE_MS = 10 * 60 * 1000
const BUDGET_MS = 125 * 1000 // la fonction a 150 s au plus
const MAX_TURNS = 8
const MAX_ATTEMPTS = 2 // ensuite le message est laissé à la session Claude Code

/** relay : la session longue s'est arrêtée sans répondre, l'API reprend le message (mode relais). */
export type Claimed = { id: string; created_at: string; message: string; session_id: string | null; relay?: boolean }
export type ApiOutcome = { answered: number; transmitted: number; limited: boolean; failed: number }

// Consignes : version courte de coach/COACH.md (sections 1, 2, 4 et 5), pour garder chaque appel léger.
// À mettre à jour ici aussi quand une règle de COACH.md change.
const INSTRUCTIONS = `Tu es le coach course de l’appli « Carnet d’entraînement » : tu prépares le coureur au semi-marathon du dossier. Il vient d’écrire un message dans l’appli et attend ta réponse tout de suite ; il ne voit que ta réponse (et la note si tu en écris une). Personne ne validera rien : agis, ne pose pas de question pour gagner du temps.

Règles d’entraînement
- Séance : session_type (footing, recuperation, sortie_longue, seuil, fractionne, allure_semi, cotes, test), titre court (« 6 × 800 m »), étapes {label, repeat, distance_km, duration_min, zone, recovery}, target_distance_km total échauffement compris. Zones : X récupération, E endurance, S allure semi, T seuil, I intervalles, R vitesse. Pas d’allure en dur (l’appli les calcule), sauf si le coureur demande un rythme précis : mets alors allure (m:ss) sur l’étape concernée, elle s’affiche à la place de la cible de la zone. Garde une « allure fixée » du dossier quand tu réécris une séance, sauf s’il demande autre chose.
- Plan : le nombre de séances par semaine du profil (une rapide, une lente à 2), à jour libre : le coureur choisit ses jours, tu donnes la semaine, jamais un jour. Au moins un jour sans course entre deux séances, pas la rapide la veille ou le lendemain de la lente, une séance ratée ne se rattrape pas en doublant.
- Phases : base (endurance, lignes droites, côtes courtes, fartlek), développement (intervalles I, seuil T), spécifique (blocs à allure S de plus en plus longs, seuil), affûtage 2 semaines (volume −30 % puis −50 %, intensité courte gardée), semaine de course.
- 75 à 80 % du volume en E. Volume hebdo +10 % au plus d’une semaine sur l’autre, semaine allégée toutes les 3 à 4 semaines. Sortie longue +1 à 2 km par semaine, pic de 18 à 21 km trois semaines avant la course.
- Ressenti : allure plus lente que la zone, ressenti 8/10 ou plus sur du facile, « pas tenu » qui se répète : allège la prochaine qualité. Plus rapide que prévu avec un ressenti de 5 ou moins, plusieurs fois : progresse un peu et propose un test (résultat à noter dans Profil, Tes perfs).
- Douleur, au pied surtout (deux semaines d’arrêt en octobre) : jamais forcer. Footing ou repos à la place de la qualité, volume réduit, avis médical si ça dure.

Ton : tutoiement, phrases courtes, concret (chiffres, semaines, allures cibles du dossier, jamais de fourchette). Coach exigeant, le coureur l’a demandé : quand une séance est adaptée et qu’il doute, tu la maintiens, tu dis pourquoi il en est capable, tu donnes une consigne simple et tu finis par « Tu la fais. » Tu n’allèges que sur un vrai signal (douleur, fatigue qui s’accumule, allures non tenues plusieurs fois, maladie, gros manque de sommeil, contrainte de temps). Encourageant sans flatterie : si l’objectif devient irréaliste, dis-le.

Comment traiter le message
1. Relis les derniers échanges : un message est souvent la suite du précédent (« oui vas-y »).
2. Écrit depuis une séance (« Sur la séance « … » : ») : réponds sur cette séance. Tu peux la modifier même si elle est verrouillée : son commentaire vaut accord.
3. Si le message le justifie, ajuste les séances à venir avec les outils (jamais une séance faite, passée ou verrouillée, sauf la séance commentée ; une séance passée non faite peut seulement passer en « sautée » si le message le dit). Consigne courte (coach_comment) sur chaque séance changée.
4. Plan changé : une seule note dans repondre, 2 à 4 lignes, ce qui a changé et pourquoi.
5. Termine toujours par repondre : 1 à 3 phrases (5 au plus si la question l’exige), un seul paragraphe, sans markdown ni liste ni tiret cadratin, et un titre de 3 à 7 mots (la demande et son issue).
6. Objectif de temps ou séances par semaine : seulement sur demande claire (modifier_profil). Jamais de changement de sortie ni de perf.
7. Tu traites toi-même ce qui est rapide : une question sur une séance ou une allure, un doute, la motivation, un petit ajustement d’une ou deux séances, une douleur (réponse prudente tout de suite).
8. Appelle confier_a_la_session_longue, sans rien modifier ni répondre, dès qu’il faut vraiment réfléchir : changer plus de deux séances ou une semaine entière, revoir l’objectif ou la structure du plan, analyser la progression en détail, question en plusieurs parties, ou message qui parle, même en partie, de l’appli elle-même (écran, affichage, bouton, bug, nouvelle fonction). Une session plus longue répond dans les minutes qui suivent.
Ne renvoie jamais le coureur vers une autre conversation ou un autre outil.`

const RELAY = `MODE RELAIS : la session longue devait traiter ce message mais s’est arrêtée sans répondre. Le plan a peut-être déjà été modifié en partie : regarde les consignes des séances dans le dossier et pars de là. Réponds toi-même à tout ce qui concerne l’entraînement, même si c’est long (tu peux modifier plusieurs séances ou semaines). Si le message demande une modification de l’appli, dis en une phrase qu’elle n’a pas pu être faite cette fois et qu’il peut la redemander. La session longue n’est pas disponible : termine par repondre.`

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
    allure: { type: 'string', description: 'm:ss par km, seulement si le coureur demande un rythme précis ; sinon la zone décide' },
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
    name: 'confier_a_la_session_longue',
    description: 'Demande qui exige une vraie réflexion (plusieurs séances ou semaines à revoir, objectif, analyse détaillée) ou qui touche l’appli elle-même : une session plus longue s’en charge. Ne réponds pas et ne modifie rien.',
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

/** Allure fixée : « 6:15 » ou des secondes par km ; entre 2:30 et 15:00, sinon ignorée. */
function paceSec(v: unknown): number | null {
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2})[:'h](\d{2})$/) : null
  const sec = m ? Number(m[1]) * 60 + Number(m[2]) : typeof v === 'number' ? Math.round(v) : NaN
  return sec >= 150 && sec <= 900 ? sec : null
}

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
    const pace = paceSec(x.allure ?? x.pace_sec)
    if (pace) step.pace_sec = pace
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
/** Jetons du modèle principal ; extraUsd : coût du tri préalable (autre modèle). */
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; extraUsd: number }
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
async function handleOne(db: Db, apiKey: string, model: string, request: Claimed, deadline: number, usage: Usage): Promise<Result> {
  if (model === MODEL && !request.relay) {
    try {
      const t = await triage(db, apiKey, request, deadline)
      usage.extraUsd += t.costUsd
      if (t.toSession) return { kind: 'transmis', raison: 'Tri : demande qui demande réflexion ou touche l’appli.' }
    } catch (e) {
      console.error('tri', e) // tri indisponible : Sonnet décide seul
    }
  }
  const dossier = await buildDossier(db, { excludeRequestIds: [request.id] })
  const ctx: Ctx = { db, request, today: dossier.today, raceDate: dossier.raceDate, firstMonday: dossier.firstMonday, changed: false, refused: false }

  let focus = ''
  if (request.session_id) {
    const { data } = await db.from('plan_sessions').select(SESSION_COLUMNS).eq('id', request.session_id).maybeSingle()
    focus = data
      ? `\n\nSéance commentée (tu peux la modifier même si elle est verrouillée) :\n${sessionText(data as Session)}`
      : '\n\n(La séance commentée n’existe plus.)'
  }

  const system = [{ type: 'text', text: request.relay ? `${INSTRUCTIONS}\n\n${RELAY}` : INSTRUCTIONS }]
  // En relais, plus de session longue à qui confier, et la réflexion préalable reste permise.
  const tools = request.relay ? TOOLS.filter((t) => t.name !== 'confier_a_la_session_longue') : TOOLS
  const thinking = request.relay ? {} : thinkingFor(model)
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
    const res = await callApi(apiKey, { model, max_tokens: 8000, system, tools, messages, output_config: { effort: EFFORT }, ...thinking }, left)
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
      } else if (call.name === 'confier_a_la_session_longue') {
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
/**
 * Prend en charge les messages pas encore vus par l'API (ou abandonnés depuis 10 min), et, en mode relais,
 * ceux que la session longue n'a pas réussi à traiter : pris en charge il y a plus de 10 min sans réponse,
 * ou jamais pris en charge après deux lancements.
 */
export async function claimForApi(db: Db): Promise<Claimed[]> {
  const now = new Date().toISOString()
  const stale = new Date(Date.now() - STALE_MS).toISOString()
  const [fresh, relay] = await Promise.all([
    db
      .from('coach_requests')
      .update({ claimed_at: now })
      .eq('status', 'en_attente')
      .is('handler', null)
      .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
      .select('id,created_at,message,session_id'),
    db
      .from('coach_requests')
      .update({ claimed_at: now })
      .eq('status', 'en_attente')
      .eq('handler', 'session')
      .or(`claimed_at.lt.${stale},and(claimed_at.is.null,session_tries.gte.2,created_at.lt.${stale})`)
      .select('id,created_at,message,session_id'),
  ])
  if (fresh.error) throw new Error(fresh.error.message)
  if (relay.error) throw new Error(relay.error.message)
  return [...((fresh.data ?? []) as Claimed[]), ...((relay.data ?? []) as Claimed[]).map((r) => ({ ...r, relay: true }))].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )
}

const failuresOf = async (db: Db, id: string) =>
  (
    await db
      .from('coach_api_log')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', id)
      .in('outcome', ['erreur', 'abandon'])
  ).count ?? 0

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
      // Relais déjà raté deux fois : on n'insiste plus (la revue du soir le reprendra), sans rien dépenser.
      if (r.relay && (await failuresOf(db, r.id)) >= MAX_ATTEMPTS) continue
      const t0 = Date.now()
      const model = await pickModel(db)
      const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, extraUsd: 0 }
      const log = (o: string, error?: string) =>
        db.from('coach_api_log').insert({
          request_id: r.id,
          mode: 'reponse',
          outcome: o,
          model,
          cost_usd: Math.round(costOf(model, usage) * 10000) / 10000,
          input_tokens: usage.input,
          output_tokens: usage.output,
          cache_read_tokens: usage.cacheRead,
          cache_write_tokens: usage.cacheWrite,
          duration_ms: Date.now() - t0,
          error: error ?? null,
        })
      try {
        const res = await handleOne(db, apiKey, model, r, deadline, usage)
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
        // En relais, il reste pris en charge : il sera retenté dans 10 min, puis laissé à la revue du soir.
        if (r.relay) continue
        if ((await failuresOf(db, r.id)) >= MAX_ATTEMPTS)
          await db.from('coach_requests').update({ handler: 'session', claimed_at: null }).eq('id', r.id).eq('status', 'en_attente')
        else await release(db, [r.id])
      }
    }
    queue = deadline - Date.now() > 30000 ? await claimForApi(db) : []
  }
  return outcome
}
