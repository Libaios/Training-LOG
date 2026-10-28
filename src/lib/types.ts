export type Exercise = {
  id: string
  name: string
  muscle_group: string | null
  archived: boolean
}

export type TemplateItem = {
  id: string
  template_id: string
  exercise_id: string
  position: number
  target_sets: number | null
  target_reps: string | null
}

export type Template = {
  id: string
  name: string
  items: TemplateItem[]
}

export type WorkoutSet = {
  id: string
  workout_id: string
  exercise_id: string
  position: number
  set_number: number
  reps: number
  weight_kg: number
  rir: number | null
}

export type Workout = {
  id: string
  performed_on: string
  title: string | null
  template_id: string | null
  notes: string | null
  created_at: string
  sets: WorkoutSet[]
}

export const RUN_TYPES = [
  { value: 'endurance', label: 'Endurance' },
  { value: 'fractionne', label: 'Fractionné' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'sortie_longue', label: 'Sortie longue' },
  { value: 'recuperation', label: 'Récupération' },
  { value: 'course', label: 'Compétition' },
] as const

export type RunType = (typeof RUN_TYPES)[number]['value']

export function runTypeLabel(type: RunType): string {
  return RUN_TYPES.find((t) => t.value === type)?.label ?? type
}

export type Run = {
  id: string
  performed_on: string
  run_type: RunType
  distance_km: number
  duration_sec: number
  avg_hr: number | null
  notes: string | null
  created_at: string
}

/** Saisie d'une séance de muscu avant enregistrement. */
export type SetDraft = { key: string; reps: string; weight: string; rir: string }
export type BlockDraft = { key: string; exerciseId: string; sets: SetDraft[] }
export type WorkoutDraft = {
  performedOn: string
  title: string
  templateId: string | null
  notes: string
  blocks: BlockDraft[]
}

export type RunDraft = {
  performedOn: string
  runType: RunType
  distance: string
  hours: string
  minutes: string
  seconds: string
  avgHr: string
  notes: string
}

export type TemplateDraftItem = { key: string; exerciseId: string; targetSets: string; targetReps: string }
