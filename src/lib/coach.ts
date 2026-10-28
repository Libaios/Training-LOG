import { useMemo } from 'react'
import { useStore } from './store'
import { pacesFor, predictTime, referenceVdot, type Paces, type PaceRange } from './pace'
import { addDays, fmtPace, fromISODate, todayISO, weekStart } from './format'
import type { PlanSession, Run, RunnerProfile } from './types'

export type CoachContext = {
  profile: RunnerProfile | null
  vdot: number | null
  paces: Paces | null
  predictedRaceSec: number | null
}

/** Niveau actuel et allures, recalculés dès qu'une perf ou l'objectif change. */
export function useCoach(): CoachContext {
  const { profile, performances } = useStore()
  return useMemo(() => {
    const ref = referenceVdot(performances)
    if (!ref) return { profile, vdot: null, paces: null, predictedRaceSec: null }
    return {
      profile,
      vdot: ref.vdot,
      paces: pacesFor(ref.vdot, profile),
      predictedRaceSec: predictTime(ref.vdot, profile?.race_distance_km ?? 21.0975),
    }
  }, [profile, performances])
}

export const fmtRange = (r: PaceRange) => `${fmtPace(r.fast)}–${fmtPace(r.slow)}`

export function daysUntil(iso: string, from = todayISO()): number {
  return Math.round((fromISODate(iso).getTime() - fromISODate(from).getTime()) / 86400000)
}

/** Semaines du plan : lundi → séances, du plus ancien au plus récent. */
export function groupByWeek(sessions: PlanSession[]): { monday: string; sessions: PlanSession[] }[] {
  const map = new Map<string, PlanSession[]>()
  for (const s of sessions) {
    const key = weekStart(s.scheduled_on)
    map.set(key, [...(map.get(key) ?? []), s])
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, list]) => ({
      monday,
      sessions: list.sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on)),
    }))
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

/** Séances de la semaine en cours et de la suivante, à partir d'aujourd'hui. */
export function upcoming(plan: PlanSession[], from = todayISO(), days = 14): PlanSession[] {
  const end = addDays(from, days)
  return plan.filter((s) => s.scheduled_on >= from && s.scheduled_on < end)
}

export const ISO_DAYS = [
  { value: 1, short: 'L', label: 'Lundi' },
  { value: 2, short: 'M', label: 'Mardi' },
  { value: 3, short: 'M', label: 'Mercredi' },
  { value: 4, short: 'J', label: 'Jeudi' },
  { value: 5, short: 'V', label: 'Vendredi' },
  { value: 6, short: 'S', label: 'Samedi' },
  { value: 7, short: 'D', label: 'Dimanche' },
]

/** Durée « h:mm:ss » ou « mm:ss » → secondes. */
export function parseClock(value: string): number | null {
  const parts = value.trim().split(':').map((p) => p.trim())
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length === 3) return nums[1] < 60 && nums[2] < 60 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : null
  if (nums.length === 2) return nums[1] < 60 ? nums[0] * 60 + nums[1] : null
  return null
}
