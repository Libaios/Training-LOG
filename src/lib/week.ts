// Semaines à jour libre : ordre des séances, règles et conseil du jour (sans React, testé à part).
import { addDays, fmtDateShort, fromISODate, weekStart } from './format'
import { sessionTone, type PlanSession, type Run, type SessionTone } from './types'

const daysBetween = (from: string, to: string) =>
  Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86400000)

const TONE_RANK: Record<SessionTone, number> = { quality: 0, easy: 1, long: 2, race: 3 }

/** Ordre d'affichage : date, puis la rapide avant la facile et la lente, puis la plus courte d'abord. */
export function sortSessions(list: PlanSession[]): PlanSession[] {
  return [...list].sort(
    (a, b) =>
      a.scheduled_on.localeCompare(b.scheduled_on) ||
      TONE_RANK[sessionTone(a.session_type)] - TONE_RANK[sessionTone(b.session_type)] ||
      (a.target_distance_km ?? 0) - (b.target_distance_km ?? 0),
  )
}

export const isTodo = (s: PlanSession) => s.status === 'prevue' || s.status === 'modifiee'

/** « Semaine du 9 au 15 nov. » pour une séance à jour libre, sinon la date. */
export function weekLabel(iso: string): string {
  const monday = weekStart(iso)
  return `du ${fmtDateShort(monday)} au ${fmtDateShort(addDays(monday, 6))}`
}

/** Règles affichées avec le plan : les séances n'ont pas de jour imposé. */
export const WEEK_RULES = [
  'Tu places tes séances quand tu veux, du lundi au dimanche.',
  'Au moins un jour sans course entre deux séances.',
  'Séance ratée : ne la rattrape pas en doublant, passe à la suite. Le coach réajuste le soir.',
  'Une douleur revient (pied, mollet…) : tu t’arrêtes et tu le dis au coach.',
]

export type DayAdvice = { tone: 'go' | 'rest' | 'done' | 'race'; title: string; detail: string }

/** La séance à privilégier quand il ne reste pas le temps de tout faire : la lente, sinon la rapide. */
function priority(todo: PlanSession[]): PlanSession {
  return (
    todo.find((s) => sessionTone(s.session_type) === 'long') ??
    todo.find((s) => sessionTone(s.session_type) === 'quality') ??
    todo[0]
  )
}

/**
 * Conseil du jour, sans jour imposé : on court si on n'a pas couru la veille et qu'il reste une séance
 * dans la semaine, en gardant au moins un jour de repos entre deux séances. Une séance à date fixe
 * (la course) garde son jour, avec un jour de repos avant.
 */
export function dayAdvice(today: string, week: PlanSession[], runs: Run[], next?: PlanSession): DayAdvice {
  const todo = sortSessions(week.filter(isTodo))
  const flex = todo.filter((s) => s.flexible)
  const fixedToday = todo.find((s) => !s.flexible && s.scheduled_on === today)
  const fixedLater = todo.filter((s) => !s.flexible && s.scheduled_on > today)
  const lastDate = runs.reduce<string | null>((m, r) => (r.performed_on <= today && (!m || r.performed_on > m) ? r.performed_on : m), null)
  const since = lastDate ? daysBetween(lastDate, today) : null
  const q = (s: PlanSession) => `« ${s.title} »`
  const comeback = since !== null && since >= 10 ? ` Ta dernière sortie date de ${since} jours : reprends tout doux.` : ''

  if (fixedToday?.session_type === 'course') {
    return { tone: 'race', title: 'Jour de course', detail: fixedToday.coach_comment ?? 'Pars à ton allure, pas plus vite.' }
  }
  if (since === 0) {
    return {
      tone: 'done',
      title: 'Sortie faite aujourd’hui',
      detail: todo.length
        ? `Repos demain. Il te reste ${todo.length === 1 ? q(todo[0]) : `${todo.length} séances`} cette semaine.`
        : 'Semaine bouclée, bravo. Récupère bien.',
    }
  }
  if (!week.length) {
    return { tone: 'rest', title: 'Pas de séance cette semaine', detail: next ? `Prochaine séance : ${q(next)}.` : 'Rien de prévu au plan.' }
  }
  if (!todo.length) {
    return {
      tone: 'done',
      title: 'Semaine bouclée',
      detail: next ? `Bravo. Prochaine séance à partir de lundi : ${q(next)}.` : 'Bravo, tout est fait.',
    }
  }
  if (fixedToday) {
    return {
      tone: 'go',
      title: 'Séance prévue aujourd’hui',
      detail: `${q(fixedToday)} est prévue aujourd’hui.${since === 1 ? ' Tu as couru hier : vas-y en douceur.' : ''}${comeback}`,
    }
  }
  const tomorrowFixed = fixedLater.find((s) => s.scheduled_on === addDays(today, 1))
  if (tomorrowFixed) {
    return {
      tone: 'rest',
      title: 'Repos aujourd’hui',
      detail: `Demain : ${q(tomorrowFixed)}. ${tomorrowFixed.session_type === 'course' ? 'Repos complet, ou 15 min de trot très facile.' : 'Garde des forces.'}`,
    }
  }

  // Les séances à jour libre se placent d'ici dimanche, ou d'ici l'avant-veille d'une séance à date fixe.
  const firstFixed = fixedLater[0]
  const deadline = firstFixed ? addDays(firstFixed.scheduled_on, -2) : addDays(weekStart(today), 6)
  const by = firstFixed ? `d’ici ${fmtDateShort(deadline)}` : 'd’ici dimanche'
  const daysLeft = daysBetween(today, deadline) + 1

  if (!flex.length || daysLeft <= 0) {
    return {
      tone: 'rest',
      title: 'Repos aujourd’hui',
      detail: firstFixed ? `Prochaine séance : ${q(firstFixed)}, le ${fmtDateShort(firstFixed.scheduled_on)}.` : 'Rien d’autre à faire cette semaine.',
    }
  }

  if (since === 1) {
    const after = daysLeft - 1
    if (after === 0) {
      return {
        tone: 'rest',
        title: 'Repos aujourd’hui',
        detail: `Tu as couru hier : garde un jour sans course. Laisse ${flex.length > 1 ? 'les séances restantes' : q(flex[0])}, le coach réajustera.`,
      }
    }
    return {
      tone: 'rest',
      title: 'Repos aujourd’hui',
      detail:
        flex.length >= 2 && after < 3
          ? `Tu as couru hier. Il ne reste pas assez de jours pour ${flex.length} séances avec du repos entre elles : fais seulement ${q(priority(flex))} ${by}, le coach réajustera.`
          : `Tu as couru hier : garde un jour sans course entre deux séances. ${
              flex.length === 1 ? `Il te reste ${q(flex[0])}, à faire ${by}.` : `Tes ${flex.length} séances, ce sera à partir de demain.`
            }`,
    }
  }

  if (flex.length >= 2 && daysLeft < 3) {
    return {
      tone: 'go',
      title: daysLeft === 1 ? 'Dernier jour pour tes séances' : 'Plus que deux jours',
      detail: `Pas le temps pour ${flex.length} séances avec du repos entre elles : fais ${q(priority(flex))} aujourd’hui et laisse l’autre, le coach réajustera.${comeback}`,
    }
  }
  return {
    tone: 'go',
    title: 'Bon jour pour courir',
    detail:
      (flex.length >= 2
        ? `Fais l’une de tes ${flex.length} séances aujourd’hui, la suivante dans deux jours ou plus.`
        : `Il te reste ${q(flex[0])}${daysLeft === 1 ? ', c’est le dernier jour pour la faire' : `, à faire ${by}`}.`) + comeback,
  }
}

export function plannedKm(sessions: PlanSession[]): number {
  return sessions.filter((s) => s.status !== 'sautee').reduce((sum, s) => sum + (s.target_distance_km ?? 0), 0)
}

export function runsKmBetween(runs: Run[], from: string, toExclusive: string): number {
  return runs.filter((r) => r.performed_on >= from && r.performed_on < toExclusive).reduce((s, r) => s + r.distance_km, 0)
}

export function sessionTarget(s: Pick<PlanSession, 'target_distance_km' | 'target_duration_min'>): string {
  const parts: string[] = []
  if (s.target_distance_km) parts.push(`${String(s.target_distance_km).replace('.', ',')} km`)
  if (s.target_duration_min) parts.push(`${s.target_duration_min} min`)
  return parts.join(', ')
}

