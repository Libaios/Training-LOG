import { useMemo } from 'react'
import { useStore } from './store'
import { effortPerfs } from './recap'
import { pacesFor, predictTime, referenceVdot, type Paces, type PaceRange } from './pace'
import { addDays, fmtPace, fromISODate, todayISO, weekStart } from './format'
import type { PlanSession, RunnerProfile } from './types'
import { sortSessions } from './week'

export { dayAdvice, isTodo, plannedKm, runsKmBetween, sessionTarget, sortSessions, weekLabel, WEEK_RULES, type DayAdvice } from './week'

export type CoachContext = {
  profile: RunnerProfile | null
  vdot: number | null
  paces: Paces | null
  predictedRaceSec: number | null
}

/** Niveau actuel et allures, recalculés dès qu'une perf ou l'objectif change. */
export function useCoach(): CoachContext {
  const { profile, performances, runs } = useStore()
  return useMemo(() => {
    const ref = referenceVdot([...performances, ...effortPerfs(runs)])
    if (!ref) return { profile, vdot: null, paces: null, predictedRaceSec: null }
    return {
      profile,
      vdot: ref.vdot,
      paces: pacesFor(ref.vdot, profile),
      predictedRaceSec: predictTime(ref.vdot, profile?.race_distance_km ?? 21.0975),
    }
  }, [profile, performances, runs])
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
    .map(([monday, list]) => ({ monday, sessions: sortSessions(list) }))
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
