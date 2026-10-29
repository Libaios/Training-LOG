// Dossier de contexte du coach IA : date, profil, niveau et allures (mêmes calculs que l'appli,
// voir src/lib/pace.ts et src/lib/recap.ts), séances, sorties, derniers échanges et notes.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, any, any, any, any>

export const TZ = 'Europe/Paris'

// Dates --------------------------------------------------------------------------------------
export const todayParis = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(iso: string, days: number): string {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toDate(s).getTime())
export const weekMonday = (iso: string) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7))
export const weekSunday = (iso: string) => addDays(weekMonday(iso), 6)
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000)

/** Minuit (heure de Paris) du jour donné, en ISO UTC. */
export function parisMidnightUtc(today: string): string {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(`${today}T12:00:00Z`))
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1'
  const hours = Number(name.match(/GMT([+-]\d+)/)?.[1] ?? 1)
  return new Date(toDate(today).getTime() - hours * 3600000).toISOString()
}

const dayName = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(toDate(iso))
const shortDay = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(toDate(iso))
const parisTime = (ts: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

// Allures (VDOT de Daniels et Gilbert, comme src/lib/pace.ts) ----------------------------------
const vo2AtVelocity = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v
const pctMax = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)

export function vdotOf(km: number, sec: number): number {
  const t = sec / 60
  return vo2AtVelocity((km * 1000) / t) / pctMax(t)
}

function paceAtFraction(vdot: number, f: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -(4.6 + vdot * f)
  return 60000 / ((-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a))
}

function predictTime(vdot: number, km: number): number {
  let lo = km * 120
  let hi = km * 900
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (vdotOf(km, mid) > vdot) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function fmtPace(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '?'
  let m = Math.floor(sec / 60)
  let s = Math.round(sec % 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

const cut = (t: string, max: number) => (t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t)
const km = (n: number | null | undefined) => (n == null ? '' : `${String(Math.round(Number(n) * 10) / 10).replace('.', ',')} km`)

type Run = {
  id: string
  performed_on: string
  run_type: string
  distance_km: number
  duration_sec: number
  avg_hr: number | null
  rpe: number | null
  notes: string | null
  planned_session_id: string | null
}
type Perf = { performed_on: string; distance_km: number; time_sec: number; kind: string; notes: string | null }
export type Session = {
  id: string
  scheduled_on: string
  session_type: string
  title: string
  description: string | null
  structure: Step[] | null
  target_distance_km: number | null
  target_duration_min: number | null
  phase: string | null
  week_number: number | null
  status: string
  locked: boolean
  flexible: boolean
  source: string
  coach_comment: string | null
  run_id: string | null
}
export type Step = {
  label: string
  repeat?: number
  distance_km?: number
  duration_min?: number
  zone?: string
  recovery?: string
}

export const SESSION_COLUMNS =
  'id,scheduled_on,session_type,title,description,structure,target_distance_km,target_duration_min,phase,week_number,status,locked,flexible,source,coach_comment,run_id'

/** Niveau : meilleure perf des 90 derniers jours (sorties à fond comprises), sinon estimation prudente. */
function level(perfs: Perf[], runs: Run[], today: string) {
  const efforts: Perf[] = runs
    .filter((r) => r.distance_km >= 3 && r.duration_sec > 0 && (r.run_type === 'course' || (r.rpe ?? 0) >= 8))
    .map((r) => ({ performed_on: r.performed_on, distance_km: r.distance_km, time_sec: r.duration_sec, kind: 'sortie à fond', notes: null }))
  const all = [...perfs, ...efforts]
  if (all.length) {
    const since = addDays(today, -90)
    const recent = all.filter((p) => p.performed_on >= since)
    const pool = recent.length ? recent : [...all].sort((a, b) => b.performed_on.localeCompare(a.performed_on)).slice(0, 1)
    let best: { vdot: number; perf: Perf } | null = null
    for (const p of pool) {
      const v = vdotOf(Number(p.distance_km), p.time_sec)
      if (!best || v > best.vdot) best = { vdot: v, perf: p }
    }
    if (best) {
      const p = best.perf
      return { vdot: best.vdot, source: `perf de référence : ${km(p.distance_km)} en ${fmtDuration(p.time_sec)} le ${p.performed_on} (${p.kind})` }
    }
  }
  const since = addDays(today, -120)
  let est: number | null = null
  for (const r of runs) {
    if (r.performed_on < since || r.performed_on > today || r.distance_km < 2 || r.duration_sec < 480) continue
    const v = vdotOf(Number(r.distance_km), r.duration_sec)
    if (Number.isFinite(v) && v >= 20 && v <= 85 && (est === null || v > est)) est = v
  }
  return est === null ? null : { vdot: est, source: 'aucun chrono : estimé d’après les sorties des 120 derniers jours (prudent, allures plutôt lentes)' }
}

function pacesText(vdot: number, goalSec: number | null, raceKm: number): string {
  const at = (f: number) => paceAtFraction(vdot, f)
  const round5 = (s: number) => Math.round(s / 5) * 5
  const zone = (z: string, name: string, fast: number, mid: number, slow: number) =>
    `- ${z} ${name} : cible ${fmtPace(round5(at(mid)))} /km (fourchette ${fmtPace(at(fast))} à ${fmtPace(at(slow))})`
  const semi = (goalSec ?? predictTime(vdot, raceKm)) / raceKm
  return [
    zone('X', 'récupération', 0.62, 0.595, 0.57),
    zone('E', 'endurance', 0.7, 0.66, 0.62),
    `- S allure semi : cible ${fmtPace(Math.round(semi))} /km (fourchette ${fmtPace(semi - 3)} à ${fmtPace(semi + 3)})${goalSec ? '' : ', d’après la prédiction faute d’objectif'}`,
    zone('T', 'seuil', 0.89, 0.88, 0.87),
    zone('I', 'intervalles', 0.98, 0.97, 0.96),
    zone('R', 'vitesse', 1.06, 1.05, 1.04),
  ].join('\n')
}

const STATUS: Record<string, string> = { prevue: 'prévue', faite: 'faite', modifiee: 'modifiée', sautee: 'sautée' }

function stepText(s: Step): string {
  const parts = [s.label]
  if (s.distance_km && !s.label.includes('×')) parts.push(km(s.distance_km))
  if (s.duration_min) parts.push(`${s.duration_min} min`)
  if (s.zone) parts.push(`zone ${s.zone}`)
  if (s.recovery) parts.push(`récup ${s.recovery}`)
  return parts.join(' ')
}

/** Une séance en détail (pour le dossier et les outils). */
export function sessionText(s: Session, runsById?: Map<string, Run>): string {
  const when = s.flexible
    ? `jour libre, semaine du ${weekMonday(s.scheduled_on)} au ${s.scheduled_on}`
    : `date fixe ${s.scheduled_on} (${shortDay(s.scheduled_on)})`
  const target = [km(s.target_distance_km), s.target_duration_min ? `${s.target_duration_min} min` : ''].filter(Boolean).join(', ')
  const lines = [
    `- [${s.id}] ${s.session_type} « ${s.title} » ; ${when} ; ${STATUS[s.status] ?? s.status}${s.locked ? ', verrouillée (modifiée par le coureur)' : ''}${target ? ` ; ${target}` : ''}${s.phase ? ` ; phase ${s.phase}` : ''}`,
  ]
  const steps = Array.isArray(s.structure) ? s.structure : []
  if (steps.length) lines.push(`  étapes : ${steps.map(stepText).join(' / ')}`)
  if (s.description) lines.push(`  description : ${s.description}`)
  if (s.coach_comment) lines.push(`  consigne : ${s.coach_comment}`)
  const run = s.run_id ? runsById?.get(s.run_id) : undefined
  if (run) lines.push(`  sortie liée : ${runText(run)}`)
  return lines.join('\n')
}

function runText(r: Run): string {
  const pace = r.distance_km > 0 ? `${fmtPace(r.duration_sec / Number(r.distance_km))} /km` : ''
  return [
    `${r.performed_on} (${shortDay(r.performed_on)}) ${r.run_type} ${km(r.distance_km)} en ${fmtDuration(r.duration_sec)} (${pace})`,
    r.avg_hr ? `FC ${r.avg_hr}` : '',
    r.rpe ? `ressenti ${r.rpe}/10` : 'ressenti non noté',
    r.notes ? `notes : « ${r.notes} »` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

export type Dossier = { text: string; today: string; raceDate: string; firstMonday: string | null }

/** Construit le dossier envoyé au coach. */
export async function buildDossier(db: Db, opts: { excludeRequestIds?: string[] } = {}): Promise<Dossier> {
  const today = todayParis()
  const monday = weekMonday(today)
  const from = addDays(monday, -7)
  const to = addDays(monday, 20) // fin de la 3e semaine (semaine en cours + 2)

  const [profileRes, perfsRes, runsRes, sessionsRes, firstRes, exchRes, notesRes] = await Promise.all([
    db.from('runner_profile').select('*').eq('id', 1).maybeSingle(),
    db.from('performances').select('performed_on,distance_km,time_sec,kind,notes').order('performed_on', { ascending: false }),
    db
      .from('runs')
      .select('id,performed_on,run_type,distance_km,duration_sec,avg_hr,rpe,notes,planned_session_id')
      .gte('performed_on', addDays(today, -120))
      .order('performed_on', { ascending: false }),
    db.from('plan_sessions').select(SESSION_COLUMNS).gte('scheduled_on', from).order('scheduled_on').order('created_at'),
    db.from('plan_sessions').select('scheduled_on').order('scheduled_on').limit(1).maybeSingle(),
    db
      .from('coach_requests')
      .select('id,created_at,message,response,session_id')
      .eq('status', 'traitee')
      .not('response', 'is', null)
      .order('handled_at', { ascending: false })
      .limit(6),
    db.from('coach_notes').select('created_at,kind,title,body').order('created_at', { ascending: false }).limit(2),
  ])
  for (const r of [profileRes, perfsRes, runsRes, sessionsRes, exchRes, notesRes]) if (r.error) throw new Error(r.error.message)

  const p = profileRes.data ?? {}
  const perfs = (perfsRes.data ?? []) as Perf[]
  const runs = ((runsRes.data ?? []) as Run[]).map((r) => ({ ...r, distance_km: Number(r.distance_km) }))
  const sessions = (sessionsRes.data ?? []) as Session[]
  const runsById = new Map(runs.map((r) => [r.id, r]))
  const raceKm = Number(p.race_distance_km ?? 21.0975)
  const raceDate: string = p.race_date ?? '2027-04-04'
  const goal: number | null = p.goal_time_sec ?? null

  const out: string[] = []
  out.push(
    '## Aujourd’hui',
    `${dayName(today)} (${today}). Semaine en cours : du lundi ${monday} au dimanche ${addDays(monday, 6)}. Course dans ${daysBetween(today, raceDate)} jours.`,
  )

  out.push(
    '',
    '## Profil',
    `Course : ${p.race_name ?? '?'} le ${raceDate} (${km(raceKm)}).`,
    `Objectif de temps : ${goal ? fmtDuration(goal) : 'pas encore fixé'}. Séances par semaine : ${p.sessions_per_week ?? '?'}.`,
    `Volume hebdo déclaré : ${p.current_weekly_km ? km(p.current_weekly_km) : '?'} ; plus longue sortie récente : ${p.longest_recent_run_km ? km(p.longest_recent_run_km) : '?'}.`,
    `Contraintes : ${p.constraints || 'aucune notée'}.`,
  )

  const lv = level(perfs, runs, today)
  out.push('', '## Niveau et allures (calculés comme dans l’appli)')
  if (lv) {
    out.push(
      `VDOT ${lv.vdot.toFixed(1).replace('.', ',')}, ${lv.source}. Semi prédit : ${fmtDuration(predictTime(lv.vdot, raceKm))}.`,
      'Allure cible fixe par zone (celle que voit le coureur) et fourchette (pour juger une sortie) :',
      pacesText(lv.vdot, goal, raceKm),
    )
  } else out.push('Pas assez de données pour calculer les allures.')

  out.push('', '## Perfs chronométrées')
  out.push(perfs.length ? perfs.map((x) => `- ${x.performed_on} ${km(x.distance_km)} en ${fmtDuration(x.time_sec)} (${x.kind})${x.notes ? `, ${x.notes}` : ''}`).join('\n') : 'Aucune.')

  const recentRuns = runs.filter((r) => r.performed_on >= addDays(today, -28))
  out.push('', '## Sorties des 4 dernières semaines (plus récentes d’abord)')
  out.push(
    recentRuns.length
      ? recentRuns
          .map((r) => {
            const linked = r.planned_session_id ? sessions.find((s) => s.id === r.planned_session_id) : undefined
            return `- ${runText(r)}${linked ? ` ; séance « ${linked.title} »` : r.planned_session_id ? ' ; liée à une séance' : ' ; hors plan'}`
          })
          .join('\n')
      : 'Aucune.',
  )
  const weekKm = (m: string) =>
    runs.filter((r) => r.performed_on >= m && r.performed_on <= addDays(m, 6)).reduce((s, r) => s + r.distance_km, 0)
  out.push(
    `Km par semaine (4 dernières, la plus ancienne d’abord) : ${[3, 2, 1, 0].map((i) => km(weekKm(addDays(monday, -7 * i))) || '0 km').join(', ')} (la dernière est la semaine en cours).`,
  )

  sessions.sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on))
  const detail = sessions.filter((s) => s.scheduled_on <= to)
  const later = sessions.filter((s) => s.scheduled_on > to)
  out.push('', `## Plan en détail : du ${from} au ${to} (id entre crochets)`)
  out.push(detail.length ? detail.map((s) => sessionText(s, runsById)).join('\n') : 'Aucune séance.')
  // Suite du plan : une ligne par semaine, sans les id (lire_seances donne le détail).
  const weeks = new Map<string, Session[]>()
  for (const s of later) weeks.set(weekMonday(s.scheduled_on), [...(weeks.get(weekMonday(s.scheduled_on)) ?? []), s])
  out.push('', '## Suite du plan jusqu’à la course, par semaine (détail et id : outil lire_seances)')
  out.push(
    weeks.size
      ? [...weeks.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([m, list]) =>
              `- sem. ${list[0].week_number ?? '?'} du ${m}${list[0].phase ? `, ${list[0].phase}` : ''} : ${list
                .map((s) => `${s.title}${s.target_distance_km ? ` (${km(s.target_distance_km)})` : ''}${s.locked ? ' [verrouillée]' : ''}${s.status !== 'prevue' ? ` [${STATUS[s.status] ?? s.status}]` : ''}`)
                .join(' ; ')}`,
          )
          .join('\n')
      : 'Rien après.',
  )

  const exch = ((exchRes.data ?? []) as { id: string; created_at: string; message: string; response: string }[])
    .filter((e) => !opts.excludeRequestIds?.includes(e.id))
    .reverse()
  out.push('', '## Derniers échanges (le plus ancien d’abord)')
  out.push(exch.length ? exch.map((e) => `- ${parisTime(e.created_at)}\n  Coureur : ${cut(e.message, 300)}\n  Coach : ${cut(e.response, 400)}`).join('\n') : 'Aucun.')

  const notes = ((notesRes.data ?? []) as { created_at: string; kind: string; title: string; body: string }[]).reverse()
  out.push('', '## Dernières notes du coach (la plus ancienne d’abord)')
  out.push(notes.length ? notes.map((n) => `- ${parisTime(n.created_at)} (${n.kind}) ${n.title} : ${cut(n.body, 400)}`).join('\n') : 'Aucune.')

  return { text: out.join('\n'), today, raceDate, firstMonday: firstRes.data?.scheduled_on ? weekMonday(firstRes.data.scheduled_on) : null }
}
