import { addDays, paceOf, weekStart, todayISO } from './format'
import type { Run, Workout, WorkoutSet } from './types'

/** 1RM estimé (formule d'Epley). */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function setsVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0)
}

export function exerciseCount(w: Workout): number {
  return new Set(w.sets.map((s) => s.exercise_id)).size
}

/** Les n derniers lundis, du plus ancien au plus récent. */
export function lastWeeks(n: number, from = todayISO()): string[] {
  const current = weekStart(from)
  return Array.from({ length: n }, (_, i) => addDays(current, -7 * (n - 1 - i)))
}

export function weeklyVolume(workouts: Workout[], weeks: string[]) {
  const map = new Map(weeks.map((w) => [w, 0]))
  for (const w of workouts) {
    const key = weekStart(w.performed_on)
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + setsVolume(w.sets))
  }
  return weeks.map((week) => ({ week, value: Math.round(map.get(week) ?? 0) }))
}

export function weeklyKm(runs: Run[], weeks: string[]) {
  const map = new Map(weeks.map((w) => [w, 0]))
  for (const r of runs) {
    const key = weekStart(r.performed_on)
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + r.distance_km)
  }
  return weeks.map((week) => ({ week, value: Math.round((map.get(week) ?? 0) * 10) / 10 }))
}

export type ExerciseSession = {
  workoutId: string
  date: string
  sets: WorkoutSet[]
  bestE1rm: number
  maxWeight: number
  volume: number
}

/** Historique d'un exercice, du plus ancien au plus récent. */
export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = []
  for (const w of workouts) {
    const sets = w.sets
      .filter((s) => s.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number)
    if (!sets.length) continue
    out.push({
      workoutId: w.id,
      date: w.performed_on,
      sets,
      bestE1rm: Math.max(...sets.map((s) => e1rm(s.weight_kg, s.reps))),
      maxWeight: Math.max(...sets.map((s) => s.weight_kg)),
      volume: setsVolume(sets),
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Dernière séance contenant cet exercice, hors séance en cours d'édition. */
export function lastSessionFor(
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string,
): ExerciseSession | null {
  const history = exerciseHistory(
    workouts.filter((w) => w.id !== excludeWorkoutId),
    exerciseId,
  )
  return history.length ? history[history.length - 1] : null
}

export function bestSet(sets: WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null
  for (const s of sets) {
    if (!best || e1rm(s.weight_kg, s.reps) > e1rm(best.weight_kg, best.reps)) best = s
  }
  return best
}

export function runRecords(runs: Run[]) {
  const longest = runs.reduce<Run | null>((best, r) => (!best || r.distance_km > best.distance_km ? r : best), null)
  const fastestOver = (km: number) =>
    runs
      .filter((r) => r.distance_km >= km)
      .reduce<Run | null>(
        (best, r) =>
          !best || paceOf(r.distance_km, r.duration_sec) < paceOf(best.distance_km, best.duration_sec) ? r : best,
        null,
      )
  return { longest, fastest5: fastestOver(5), fastest10: fastestOver(10) }
}

/** Activités d'une journée, pour la bande de la semaine. */
export function activityByDay(workouts: Workout[], runs: Run[]) {
  const map = new Map<string, { strength: number; run: number }>()
  const bump = (date: string, key: 'strength' | 'run') => {
    const cur = map.get(date) ?? { strength: 0, run: 0 }
    cur[key] += 1
    map.set(date, cur)
  }
  workouts.forEach((w) => bump(w.performed_on, 'strength'))
  runs.forEach((r) => bump(r.performed_on, 'run'))
  return map
}
