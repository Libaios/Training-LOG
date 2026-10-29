import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { parseDecimal, parseIntOrNull } from './format'
import type {
  CoachFire,
  CoachNote,
  FireStatus,
  CoachRequest,
  Exercise,
  Performance,
  PlanSession,
  Run,
  RunDraft,
  RunnerProfile,
  SessionStatus,
  Template,
  TemplateDraftItem,
  TemplateItem,
  Workout,
  WorkoutDraft,
  WorkoutSet,
} from './types'

type Data = {
  exercises: Exercise[]
  templates: Template[]
  workouts: Workout[]
  runs: Run[]
  profile: RunnerProfile | null
  performances: Performance[]
  plan: PlanSession[]
  coachNotes: CoachNote[]
  coachRequests: CoachRequest[]
  coachFires: CoachFire[]
}

export type SessionPatch = Partial<
  Pick<
    PlanSession,
    | 'scheduled_on'
    | 'session_type'
    | 'title'
    | 'description'
    | 'structure'
    | 'target_distance_km'
    | 'target_duration_min'
    | 'phase'
    | 'week_number'
    | 'status'
    | 'locked'
    | 'coach_comment'
    | 'flexible'
  >
>

const EMPTY: Data = {
  exercises: [],
  templates: [],
  workouts: [],
  runs: [],
  profile: null,
  performances: [],
  plan: [],
  coachNotes: [],
  coachRequests: [],
  coachFires: [],
}

type Store = Data & {
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  exerciseById: Map<string, Exercise>
  saveWorkout: (draft: WorkoutDraft, id?: string) => Promise<string>
  deleteWorkout: (id: string) => Promise<void>
  saveRun: (draft: RunDraft, id?: string) => Promise<string>
  deleteRun: (id: string) => Promise<void>
  addExercise: (name: string, muscleGroup: string) => Promise<Exercise>
  updateExercise: (id: string, patch: Partial<Pick<Exercise, 'name' | 'muscle_group' | 'archived'>>) => Promise<void>
  saveTemplate: (name: string, items: TemplateDraftItem[], id?: string) => Promise<string>
  deleteTemplate: (id: string) => Promise<void>
  sessionById: Map<string, PlanSession>
  saveProfile: (patch: Partial<Omit<RunnerProfile, 'id'>>) => Promise<void>
  addPerformance: (perf: Omit<Performance, 'id'>) => Promise<void>
  deletePerformance: (id: string) => Promise<void>
  saveSession: (patch: SessionPatch, id?: string) => Promise<string>
  setSessionStatus: (id: string, status: SessionStatus) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendCoachRequest: (message: string, sessionId?: string) => Promise<FireStatus>
  relaunchCoach: () => Promise<FireStatus>
  markNotesRead: (ids: string[]) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

const PAGE = 1000

async function fetchAll<T>(table: string, select: string, orders: [string, boolean][]): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(select)
    for (const [column, ascending] of orders) query = query.order(column, { ascending })
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v)
}

async function loadAll(): Promise<Data> {
  const [exercises, templates, templateItems, workoutRows, sets, runs] = await Promise.all([
    fetchAll<Exercise>('exercises', 'id,name,muscle_group,archived', [['name', true]]),
    fetchAll<Omit<Template, 'items'>>('templates', 'id,name', [['name', true]]),
    fetchAll<TemplateItem>('template_exercises', 'id,template_id,exercise_id,position,target_sets,target_reps', [
      ['position', true],
    ]),
    fetchAll<Omit<Workout, 'sets'>>('workouts', 'id,performed_on,title,template_id,notes,created_at', [
      ['performed_on', false],
      ['created_at', false],
    ]),
    fetchAll<WorkoutSet>('workout_sets', 'id,workout_id,exercise_id,position,set_number,reps,weight_kg,rir', [
      ['position', true],
      ['set_number', true],
    ]),
    fetchAll<Run>(
      'runs',
      'id,performed_on,run_type,distance_km,duration_sec,avg_hr,notes,created_at,planned_session_id,rpe,source',
      [
        ['performed_on', false],
        ['created_at', false],
      ],
    ),
  ])

  const [profileRes, performances, plan, coachNotes, coachRequests, firesRes] = await Promise.all([
    supabase
      .from('runner_profile')
      .select(
        'id,race_name,race_date,race_distance_km,goal_time_sec,sessions_per_week,available_days,long_run_day,current_weekly_km,longest_recent_run_km,constraints,last_coach_review_at',
      )
      .eq('id', 1)
      .maybeSingle(),
    fetchAll<Performance>('performances', 'id,performed_on,distance_km,time_sec,kind,notes', [['performed_on', false]]),
    fetchAll<PlanSession>(
      'plan_sessions',
      'id,scheduled_on,session_type,title,description,structure,target_distance_km,target_duration_min,phase,week_number,status,run_id,locked,source,coach_comment,flexible,updated_at',
      [
        ['scheduled_on', true],
        ['created_at', true],
      ],
    ),
    fetchAll<CoachNote>('coach_notes', 'id,created_at,kind,title,body,read', [['created_at', false]]),
    fetchAll<CoachRequest>('coach_requests', 'id,created_at,kind,message,status,response,handled_at,session_id,claimed_at', [['created_at', false]]),
    supabase.from('coach_fire_log').select('fired_at,status,session_url,finished_at').order('fired_at', { ascending: false }).limit(5),
  ])
  if (profileRes.error) throw profileRes.error
  const rawProfile = profileRes.data as RunnerProfile | null

  const setsByWorkout = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    const list = setsByWorkout.get(s.workout_id) ?? []
    list.push({ ...s, weight_kg: num(s.weight_kg) })
    setsByWorkout.set(s.workout_id, list)
  }
  const itemsByTemplate = new Map<string, TemplateItem[]>()
  for (const it of templateItems) {
    const list = itemsByTemplate.get(it.template_id) ?? []
    list.push(it)
    itemsByTemplate.set(it.template_id, list)
  }

  return {
    exercises,
    templates: templates.map((t) => ({ ...t, items: itemsByTemplate.get(t.id) ?? [] })),
    workouts: workoutRows.map((w) => ({ ...w, sets: setsByWorkout.get(w.id) ?? [] })),
    runs: runs.map((r) => ({ ...r, distance_km: num(r.distance_km) })),
    profile: rawProfile
      ? {
          ...rawProfile,
          race_distance_km: num(rawProfile.race_distance_km),
          current_weekly_km: rawProfile.current_weekly_km === null ? null : num(rawProfile.current_weekly_km),
          longest_recent_run_km: rawProfile.longest_recent_run_km === null ? null : num(rawProfile.longest_recent_run_km),
        }
      : null,
    performances: performances.map((p) => ({ ...p, distance_km: num(p.distance_km) })),
    plan: plan.map((p) => ({
      ...p,
      structure: Array.isArray(p.structure) ? p.structure : [],
      target_distance_km: p.target_distance_km === null ? null : num(p.target_distance_km),
    })),
    coachNotes,
    coachRequests,
    // Le journal est facultatif : s'il est illisible, l'appli fonctionne sans le suivi en direct.
    coachFires: firesRes.error ? [] : ((firesRes.data ?? []) as CoachFire[]),
  }
}

/** Appelle la fonction serveur qui lance le coach ; renvoie son statut, y compris en cas de refus (403). */
async function fireCoach(body: Record<string, unknown>): Promise<FireStatus> {
  try {
    const { data, error } = await supabase.functions.invoke('coach-fire', { body })
    if (!error && data && typeof data === 'object' && 'status' in data) return (data as { status: FireStatus }).status
    const ctx = (error as { context?: unknown } | null)?.context
    if (ctx instanceof Response) {
      const parsed = await ctx.json().catch(() => null)
      if (parsed && typeof parsed === 'object' && 'status' in parsed) return (parsed as { status: FireStatus }).status
    }
  } catch {
    /* réseau indisponible : la demande d'entraînement reste en attente pour la revue du soir */
  }
  return 'error'
}

/** Transforme la saisie en lignes de séries valides (les lignes sans reps sont ignorées). */
export function draftToSets(draft: WorkoutDraft) {
  const rows: Omit<WorkoutSet, 'id' | 'workout_id'>[] = []
  draft.blocks.forEach((block, position) => {
    let n = 0
    for (const s of block.sets) {
      const reps = parseIntOrNull(s.reps)
      if (reps === null) continue
      n += 1
      rows.push({
        exercise_id: block.exerciseId,
        position,
        set_number: n,
        reps,
        weight_kg: parseDecimal(s.weight) ?? 0,
        rir: parseIntOrNull(s.rir),
      })
    }
  })
  return rows
}

export function runDraftDuration(d: RunDraft): number {
  return (
    (parseIntOrNull(d.hours) ?? 0) * 3600 + (parseIntOrNull(d.minutes) ?? 0) * 60 + (parseDecimal(d.seconds) ?? 0)
  )
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setError(null)
      setData(await loadAll())
    } catch (err) {
      setError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveWorkout = useCallback(
    async (draft: WorkoutDraft, id?: string) => {
      const rows = draftToSets(draft)
      const payload = {
        performed_on: draft.performedOn,
        title: draft.title.trim() || null,
        template_id: draft.templateId,
        notes: draft.notes.trim() || null,
      }
      let workoutId = id
      if (workoutId) {
        const { error: e1 } = await supabase.from('workouts').update(payload).eq('id', workoutId)
        if (e1) throw e1
        const { error: e2 } = await supabase.from('workout_sets').delete().eq('workout_id', workoutId)
        if (e2) throw e2
      } else {
        const { data: inserted, error: e1 } = await supabase.from('workouts').insert(payload).select('id').single()
        if (e1) throw e1
        workoutId = (inserted as { id: string }).id
      }
      if (rows.length) {
        const { error: e3 } = await supabase
          .from('workout_sets')
          .insert(rows.map((r) => ({ ...r, workout_id: workoutId })))
        if (e3) throw e3
      }
      await reload()
      return workoutId!
    },
    [reload],
  )

  const deleteWorkout = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('workouts').delete().eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const saveRun = useCallback(
    async (draft: RunDraft, id?: string) => {
      const previous = id ? data.runs.find((r) => r.id === id) : undefined
      const payload = {
        performed_on: draft.performedOn,
        run_type: draft.runType,
        distance_km: parseDecimal(draft.distance),
        duration_sec: Math.round(runDraftDuration(draft)),
        avg_hr: parseIntOrNull(draft.avgHr),
        notes: draft.notes.trim() || null,
        rpe: parseIntOrNull(draft.rpe),
        planned_session_id: draft.plannedSessionId,
      }
      let runId = id
      if (runId) {
        const { error: e } = await supabase.from('runs').update(payload).eq('id', runId)
        if (e) throw e
      } else {
        const { data: inserted, error: e } = await supabase.from('runs').insert(payload).select('id').single()
        if (e) throw e
        runId = (inserted as { id: string }).id
      }
      // La séance qui n'est plus liée redevient « prévue », la nouvelle passe « faite ».
      if (previous?.planned_session_id && previous.planned_session_id !== draft.plannedSessionId) {
        const { error: e } = await supabase
          .from('plan_sessions')
          .update({ status: 'prevue', run_id: null })
          .eq('id', previous.planned_session_id)
        if (e) throw e
      }
      if (draft.plannedSessionId) {
        const { error: e } = await supabase
          .from('plan_sessions')
          .update({ status: 'faite', run_id: runId })
          .eq('id', draft.plannedSessionId)
        if (e) throw e
      }
      await reload()
      return runId!
    },
    [reload, data.runs],
  )

  const deleteRun = useCallback(
    async (id: string) => {
      const run = data.runs.find((r) => r.id === id)
      if (run?.planned_session_id) {
        const { error: e1 } = await supabase
          .from('plan_sessions')
          .update({ status: 'prevue', run_id: null })
          .eq('id', run.planned_session_id)
        if (e1) throw e1
      }
      const { error: e } = await supabase.from('runs').delete().eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload, data.runs],
  )

  const addExercise = useCallback(
    async (name: string, muscleGroup: string) => {
      const { data: inserted, error: e } = await supabase
        .from('exercises')
        .insert({ name: name.trim(), muscle_group: muscleGroup.trim() || null })
        .select('id,name,muscle_group,archived')
        .single()
      if (e) throw e
      await reload()
      return inserted as Exercise
    },
    [reload],
  )

  const updateExercise = useCallback(
    async (id: string, patch: Partial<Pick<Exercise, 'name' | 'muscle_group' | 'archived'>>) => {
      const { error: e } = await supabase.from('exercises').update(patch).eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const saveTemplate = useCallback(
    async (name: string, items: TemplateDraftItem[], id?: string) => {
      let templateId = id
      if (templateId) {
        const { error: e1 } = await supabase.from('templates').update({ name: name.trim() }).eq('id', templateId)
        if (e1) throw e1
        const { error: e2 } = await supabase.from('template_exercises').delete().eq('template_id', templateId)
        if (e2) throw e2
      } else {
        const { data: inserted, error: e1 } = await supabase
          .from('templates')
          .insert({ name: name.trim() })
          .select('id')
          .single()
        if (e1) throw e1
        templateId = (inserted as { id: string }).id
      }
      if (items.length) {
        const { error: e3 } = await supabase.from('template_exercises').insert(
          items.map((it, position) => ({
            template_id: templateId,
            exercise_id: it.exerciseId,
            position,
            target_sets: parseIntOrNull(it.targetSets),
            target_reps: it.targetReps.trim() || null,
          })),
        )
        if (e3) throw e3
      }
      await reload()
      return templateId!
    },
    [reload],
  )

  const deleteTemplate = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('templates').delete().eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const saveProfile = useCallback(
    async (patch: Partial<Omit<RunnerProfile, 'id'>>) => {
      const { error: e } = await supabase.from('runner_profile').update(patch).eq('id', 1)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const addPerformance = useCallback(
    async (perf: Omit<Performance, 'id'>) => {
      const { error: e } = await supabase.from('performances').insert(perf)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const deletePerformance = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('performances').delete().eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  /** Modifier ou créer une séance à la main : elle est verrouillée pour le coach. */
  const saveSession = useCallback(
    async (patch: SessionPatch, id?: string) => {
      let sessionId = id
      if (sessionId) {
        const { error: e } = await supabase.from('plan_sessions').update(patch).eq('id', sessionId)
        if (e) throw e
      } else {
        const { data: inserted, error: e } = await supabase
          .from('plan_sessions')
          .insert({ ...patch, source: 'utilisateur', locked: true })
          .select('id')
          .single()
        if (e) throw e
        sessionId = (inserted as { id: string }).id
      }
      await reload()
      return sessionId!
    },
    [reload],
  )

  const setSessionStatus = useCallback(
    async (id: string, status: SessionStatus) => {
      const { error: e } = await supabase.from('plan_sessions').update({ status }).eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const deleteSession = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('plan_sessions').delete().eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  /** Enregistre la demande (entraînement ou appli, le coach décide) puis lance le coach tout de suite. */
  const sendCoachRequest = useCallback(
    async (message: string, sessionId?: string): Promise<FireStatus> => {
      const { error: e } = await supabase
        .from('coach_requests')
        .insert({ message: message.trim(), session_id: sessionId ?? null })
      if (e) throw e
      const status = await fireCoach({})
      await reload()
      return status
    },
    [reload],
  )

  /** Relance le coach pour les demandes restées en attente (sans rien renvoyer). */
  const relaunchCoach = useCallback(async (): Promise<FireStatus> => {
    const status = await fireCoach({})
    await reload()
    return status
  }, [reload])

  const markNotesRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      const { error: e } = await supabase.from('coach_notes').update({ read: true }).in('id', ids)
      if (e) throw e
      await reload()
    },
    [reload],
  )

  const exerciseById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises])
  const sessionById = useMemo(() => new Map(data.plan.map((p) => [p.id, p])), [data.plan])

  const value: Store = {
    ...data,
    loading,
    error,
    reload,
    exerciseById,
    saveWorkout,
    deleteWorkout,
    saveRun,
    deleteRun,
    addExercise,
    updateExercise,
    saveTemplate,
    deleteTemplate,
    sessionById,
    saveProfile,
    addPerformance,
    deletePerformance,
    saveSession,
    setSessionStatus,
    deleteSession,
    sendCoachRequest,
    relaunchCoach,
    markNotesRead,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore doit être utilisé dans DataProvider')
  return ctx
}
