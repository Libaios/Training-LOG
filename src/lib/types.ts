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
  { value: 'loisir', label: 'Run loisir' },
  { value: 'sortie_longue', label: 'Sortie longue' },
  { value: 'seuil', label: 'Seuil' },
  { value: 'fractionne', label: 'Fractionné' },
  { value: 'allure_semi', label: 'Allure semi' },
  { value: 'cotes', label: 'Côtes' },
  { value: 'tempo', label: 'Tempo' },
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
  planned_session_id: string | null
  rpe: number | null
  source: 'manuel' | 'strava'
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
  rpe: string
  plannedSessionId: string | null
}

export type TemplateDraftItem = { key: string; exerciseId: string; targetSets: string; targetReps: string }

/* Coach course ---------------------------------------------------------------- */

export type RunnerProfile = {
  id: number
  race_name: string
  race_date: string
  race_distance_km: number
  goal_time_sec: number | null
  sessions_per_week: number
  /** Jours ISO : 1 = lundi … 7 = dimanche */
  available_days: number[]
  long_run_day: number
  current_weekly_km: number | null
  longest_recent_run_km: number | null
  constraints: string | null
  last_coach_review_at: string | null
}

export type Performance = {
  id: string
  performed_on: string
  distance_km: number
  time_sec: number
  kind: 'course' | 'test' | 'entrainement'
  notes: string | null
}

export const SESSION_TYPES = [
  { value: 'footing', label: 'Footing', tone: 'easy' },
  { value: 'recuperation', label: 'Récupération', tone: 'easy' },
  { value: 'sortie_longue', label: 'Sortie longue', tone: 'long' },
  { value: 'seuil', label: 'Seuil', tone: 'quality' },
  { value: 'fractionne', label: 'Fractionné', tone: 'quality' },
  { value: 'allure_semi', label: 'Allure semi', tone: 'quality' },
  { value: 'cotes', label: 'Côtes', tone: 'quality' },
  { value: 'test', label: 'Test', tone: 'quality' },
  { value: 'course', label: 'Course', tone: 'race' },
] as const

export type SessionType = (typeof SESSION_TYPES)[number]['value']
export type SessionTone = (typeof SESSION_TYPES)[number]['tone']

export const sessionTypeLabel = (t: SessionType) => SESSION_TYPES.find((x) => x.value === t)?.label ?? t
export const sessionTone = (t: SessionType): SessionTone => SESSION_TYPES.find((x) => x.value === t)?.tone ?? 'easy'

/** Nom court de la séance selon son ton : ce que le coureur retient (« la rapide », « la lente »). */
export const SESSION_KIND: Record<SessionTone, string> = {
  quality: 'Rapide',
  easy: 'Facile',
  long: 'Lente',
  race: 'Course',
}

/** Type de sortie proposé quand on note une séance prévue. */
export const runTypeForSession: Record<SessionType, RunType> = {
  footing: 'endurance',
  recuperation: 'recuperation',
  sortie_longue: 'sortie_longue',
  seuil: 'seuil',
  fractionne: 'fractionne',
  allure_semi: 'allure_semi',
  cotes: 'cotes',
  test: 'course',
  course: 'course',
}

export type StructureStep = {
  label: string
  repeat?: number
  distance_km?: number
  duration_min?: number
  zone?: 'X' | 'E' | 'S' | 'T' | 'I' | 'R'
  recovery?: string
}

export const PHASES = [
  { value: 'base', label: 'Base' },
  { value: 'developpement', label: 'Développement' },
  { value: 'specifique', label: 'Spécifique' },
  { value: 'affutage', label: 'Affûtage' },
  { value: 'course', label: 'Course' },
] as const

export type Phase = (typeof PHASES)[number]['value']
export const phaseLabel = (p: Phase | null) => PHASES.find((x) => x.value === p)?.label ?? ''

export type SessionStatus = 'prevue' | 'faite' | 'modifiee' | 'sautee'

export type PlanSession = {
  id: string
  scheduled_on: string
  session_type: SessionType
  title: string
  description: string | null
  structure: StructureStep[]
  target_distance_km: number | null
  target_duration_min: number | null
  phase: Phase | null
  week_number: number | null
  status: SessionStatus
  run_id: string | null
  locked: boolean
  source: 'coach' | 'utilisateur'
  coach_comment: string | null
  /** Jour libre : à faire n'importe quel jour de sa semaine ; scheduled_on = dimanche de cette semaine. */
  flexible: boolean
  updated_at: string
}

export type CoachNote = {
  id: string
  created_at: string
  kind: 'plan' | 'bilan' | 'reprogrammation' | 'conseil'
  title: string
  body: string
  read: boolean
}

export type CoachRequest = {
  id: string
  created_at: string
  kind: 'coach' | 'appli'
  message: string
  status: 'en_attente' | 'traitee'
  response: string | null
  handled_at: string | null
  /** Séance commentée, si le message a été écrit depuis une séance. */
  session_id: string | null
}

export type CoachFire = {
  fired_at: string
  status: 'ok' | 'error'
  session_url: string | null
}

/** Résultat du lancement du coach à la demande. */
export type FireStatus =
  | 'fired'
  | 'already_running'
  | 'not_configured'
  | 'nothing_pending'
  | 'bad_code'
  | 'no_app_code'
  | 'error'
