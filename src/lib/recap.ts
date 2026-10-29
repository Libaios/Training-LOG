import { addDays, paceOf, todayISO } from './format'
import { vdotOf } from './pace'
import type { Performance, Run } from './types'

export type RunRecap = {
  runs: number
  km: number
  weeklyKm: number
  longestKm: number
  avgPace: number | null
  totalSec: number
}

/** Récap des sorties des `weeks` dernières semaines (jusqu'à aujourd'hui compris). */
export function recapOf(runs: Run[], weeks = 4, today = todayISO()): RunRecap {
  const since = addDays(today, -weeks * 7 + 1)
  const list = runs.filter((r) => r.performed_on >= since && r.performed_on <= today)
  const km = list.reduce((s, r) => s + r.distance_km, 0)
  const totalSec = list.reduce((s, r) => s + r.duration_sec, 0)
  return {
    runs: list.length,
    km,
    weeklyKm: km / weeks,
    longestKm: list.reduce((m, r) => Math.max(m, r.distance_km), 0),
    avgPace: km > 0 ? paceOf(km, totalSec) : null,
    totalSec,
  }
}

/**
 * Perfs déduites des sorties : courses et sorties à fond (ressenti 8/10 ou plus) d'au moins 3 km.
 * Elles s'ajoutent aux perfs saisies pour recalculer le niveau sans rien faire.
 */
export function effortPerfs(runs: Run[]): Performance[] {
  return runs
    .filter((r) => r.distance_km >= 3 && r.duration_sec > 0 && (r.run_type === 'course' || (r.rpe ?? 0) >= 8))
    .map((r) => ({
      id: `run-${r.id}`,
      performed_on: r.performed_on,
      distance_km: r.distance_km,
      time_sec: r.duration_sec,
      kind: r.run_type === 'course' ? ('course' as const) : ('entrainement' as const),
      notes: null,
    }))
}

/**
 * Sans chrono de référence : niveau estimé d'après les sorties des 4 derniers mois (2 km et plus).
 * Ces sorties ne sont pas courues à fond : l'estimation est prudente (allures plutôt lentes).
 */
export function estimatedVdot(runs: Run[], today = todayISO()): number | null {
  const since = addDays(today, -120)
  let best: number | null = null
  for (const r of runs) {
    if (r.performed_on < since || r.performed_on > today || r.distance_km < 2 || r.duration_sec < 480) continue
    const v = vdotOf(r.distance_km, r.duration_sec)
    if (Number.isFinite(v) && v >= 20 && v <= 85 && (best === null || v > best)) best = v
  }
  return best
}
