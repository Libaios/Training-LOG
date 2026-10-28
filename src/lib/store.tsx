import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { parseDecimal, parseIntOrNull } from './format'
import type {
  Exercise,
  Run,
  RunDraft,
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
    fetchAll<Run>('runs', 'id,performed_on,run_type,distance_km,duration_sec,avg_hr,notes,created_at', [
      ['performed_on', false],
      ['created_at', false],
    ]),
  ])

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
  }
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
  const [data, setData] = useState<Data>({ exercises: [], templates: [], workouts: [], runs: [] })
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
      const payload = {
        performed_on: draft.performedOn,
        run_type: draft.runType,
        distance_km: parseDecimal(draft.distance),
        duration_sec: Math.round(runDraftDuration(draft)),
        avg_hr: parseIntOrNull(draft.avgHr),
        notes: draft.notes.trim() || null,
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
      await reload()
      return runId!
    },
    [reload],
  )

  const deleteRun = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('runs').delete().eq('id', id)
      if (e) throw e
      await reload()
    },
    [reload],
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

  const exerciseById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises])

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
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore doit être utilisé dans DataProvider')
  return ctx
}
