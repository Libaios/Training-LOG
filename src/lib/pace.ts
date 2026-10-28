/* Allures d'entraînement à partir des performances (méthode VDOT de Daniels et Gilbert). */

import type { Performance, RunnerProfile } from './types'
import { addDays, todayISO } from './format'

export type Zone = 'X' | 'E' | 'S' | 'T' | 'I' | 'R'

export const ZONES: { zone: Zone; label: string; hint: string }[] = [
  { zone: 'X', label: 'Récupération', hint: 'Très facile, on peut parler sans effort' },
  { zone: 'E', label: 'Endurance', hint: 'Footings et sortie longue, aisance respiratoire' },
  { zone: 'S', label: 'Allure semi', hint: 'L’allure visée le jour de la course' },
  { zone: 'T', label: 'Seuil', hint: 'Soutenu mais contrôlé, tenable environ 1 h en course' },
  { zone: 'I', label: 'Intervalles', hint: 'Fractions de 2 à 5 min, proche de la VMA' },
  { zone: 'R', label: 'Vitesse', hint: 'Fractions courtes et rapides, récupération complète' },
]

export const zoneLabel = (z: Zone) => ZONES.find((x) => x.zone === z)?.label ?? z

const vo2AtVelocity = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v
const pctMaxAtDuration = (tMin: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)

/** VDOT d'une performance (distance en km, temps en secondes). */
export function vdotOf(distanceKm: number, timeSec: number): number {
  const t = timeSec / 60
  const v = (distanceKm * 1000) / t
  return vo2AtVelocity(v) / pctMaxAtDuration(t)
}

function velocityAtVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -(4.6 + vo2)
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Allure (s/km) correspondant à une fraction du VDOT. */
export function paceAtFraction(vdot: number, fraction: number): number {
  return 60000 / velocityAtVo2(vdot * fraction)
}

/** Temps prédit (s) sur une distance pour un VDOT donné. */
export function predictTime(vdot: number, distanceKm: number): number {
  let lo = distanceKm * 120
  let hi = distanceKm * 900
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (vdotOf(distanceKm, mid) > vdot) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * VDOT de référence : la meilleure perf des 90 derniers jours,
 * sinon la plus récente (une perf ancienne surestime souvent le niveau actuel).
 */
export function referenceVdot(perfs: Performance[], today = todayISO()): { vdot: number; perf: Performance } | null {
  if (!perfs.length) return null
  const since = addDays(today, -90)
  const recent = perfs.filter((p) => p.performed_on >= since)
  const pool = recent.length ? recent : [...perfs].sort((a, b) => b.performed_on.localeCompare(a.performed_on)).slice(0, 1)
  let best: { vdot: number; perf: Performance } | null = null
  for (const p of pool) {
    const v = vdotOf(p.distance_km, p.time_sec)
    if (!best || v > best.vdot) best = { vdot: v, perf: p }
  }
  return best
}

export type PaceRange = { fast: number; slow: number }
export type Paces = Record<Zone, PaceRange>

/** Fourchettes d'allure par zone (s/km). L'allure semi suit l'objectif s'il est fixé. */
export function pacesFor(vdot: number, profile: Pick<RunnerProfile, 'goal_time_sec' | 'race_distance_km'> | null): Paces {
  const at = (f: number) => paceAtFraction(vdot, f)
  const raceKm = profile?.race_distance_km ?? 21.0975
  const semi = profile?.goal_time_sec ? profile.goal_time_sec / raceKm : predictTime(vdot, raceKm) / raceKm
  return {
    X: { fast: at(0.62), slow: at(0.57) },
    E: { fast: at(0.7), slow: at(0.62) },
    S: { fast: semi - 3, slow: semi + 3 },
    T: { fast: at(0.89), slow: at(0.87) },
    I: { fast: at(0.98), slow: at(0.96) },
    R: { fast: at(1.06), slow: at(1.04) },
  }
}

/** Temps prédit moins objectif (s) : positif = l'objectif demande d'aller plus vite que le niveau actuel. */
export function goalGap(vdot: number, profile: RunnerProfile): number | null {
  if (!profile.goal_time_sec) return null
  return predictTime(vdot, profile.race_distance_km) - profile.goal_time_sec
}
