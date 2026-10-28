import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditorHeader, Empty } from '../components/Layout'
import { ExercisePicker } from '../components/ExercisePicker'
import { Icon } from '../components/Icon'
import { draftToSets, useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { lastSessionFor, type ExerciseSession } from '../lib/stats'
import { fmtDateLong, fmtDateShort, fmtInt, parseDecimal, plural, toInput, todayISO, uid } from '../lib/format'
import type { BlockDraft, SetDraft, Template, Workout, WorkoutDraft } from '../lib/types'
import { readLocal, useToast, WORKOUT_DRAFT_KEY, writeLocal } from '../lib/ui'
import { navigate } from '../lib/router'

const emptySet = (): SetDraft => ({ key: uid(), reps: '', weight: '', rir: '' })

function draftFromWorkout(w: Workout): WorkoutDraft {
  const positions = Array.from(new Set(w.sets.map((s) => s.position))).sort((a, b) => a - b)
  return {
    performedOn: w.performed_on,
    title: w.title ?? '',
    templateId: w.template_id,
    notes: w.notes ?? '',
    blocks: positions.map((p) => {
      const sets = w.sets.filter((s) => s.position === p).sort((a, b) => a.set_number - b.set_number)
      return {
        key: uid(),
        exerciseId: sets[0].exercise_id,
        sets: sets.map((s) => ({
          key: uid(),
          reps: String(s.reps),
          weight: toInput(s.weight_kg),
          rir: s.rir === null ? '' : String(s.rir),
        })),
      }
    }),
  }
}

const newDraft = (): WorkoutDraft => ({ performedOn: todayISO(), title: '', templateId: null, notes: '', blocks: [] })

/** "3 × 8 à 40 kg" si toutes les séries sont identiques, sinon "8×40, 8×40, 6×42,5". */
function summarize(session: ExerciseSession): string {
  const sets = session.sets
  const same = sets.every((s) => s.reps === sets[0].reps && s.weight_kg === sets[0].weight_kg)
  const w = (n: number) => toInput(n)
  const body = same
    ? `${sets.length} × ${sets[0].reps} à ${w(sets[0].weight_kg)} kg`
    : sets.map((s) => `${s.reps}×${w(s.weight_kg)}`).join(', ') + ' kg'
  return `${body}, le ${fmtDateShort(session.date)}`
}

export function WorkoutEditor({ id }: { id?: string }) {
  const store = useStore()
  const { workouts, templates, exerciseById, loading } = store
  const toast = useToast()
  const existing = id ? workouts.find((w) => w.id === id) : undefined
  const isNew = !id

  const [draft, setDraft] = useState<WorkoutDraft>(() =>
    isNew ? (readLocal<WorkoutDraft>(WORKOUT_DRAFT_KEY) ?? newDraft()) : existing ? draftFromWorkout(existing) : newDraft(),
  )
  const [loadedId, setLoadedId] = useState<string | undefined>(existing?.id)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si on arrive directement sur une séance avant la fin du chargement.
  useEffect(() => {
    if (existing && loadedId !== existing.id) {
      setDraft(draftFromWorkout(existing))
      setLoadedId(existing.id)
    }
  }, [existing, loadedId])

  // Brouillon conservé sur le téléphone tant que la nouvelle séance n'est pas enregistrée.
  useEffect(() => {
    if (!isNew) return
    const hasContent = draft.blocks.length > 0 || draft.notes.trim() !== '' || draft.title.trim() !== ''
    writeLocal(WORKOUT_DRAFT_KEY, hasContent ? draft : null)
  }, [draft, isNew])

  const lastByExercise = useMemo(() => {
    const map = new Map<string, ExerciseSession | null>()
    for (const b of draft.blocks) {
      if (!map.has(b.exerciseId)) map.set(b.exerciseId, lastSessionFor(workouts, b.exerciseId, id))
    }
    return map
  }, [draft.blocks, workouts, id])

  const closePicker = useCallback(() => setPicking(false), [])

  if (!isNew && !existing) {
    if (loading) return null
    return (
      <main className="screen">
        <EditorHeader title="Séance" backTo="muscu" />
        <Empty>Cette séance n’existe plus.</Empty>
      </main>
    )
  }

  const update = (patch: Partial<WorkoutDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const updateBlock = (key: string, fn: (b: BlockDraft) => BlockDraft) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => (b.key === key ? fn(b) : b)) }))

  function applyTemplate(t: Template) {
    const items = [...t.items].sort((a, b) => a.position - b.position)
    update({
      title: t.name,
      templateId: t.id,
      blocks: items.map((it) => ({
        key: uid(),
        exerciseId: it.exercise_id,
        sets: Array.from({ length: it.target_sets ?? 3 }, () => ({
          ...emptySet(),
          reps: /^\d+$/.test(it.target_reps ?? '') ? (it.target_reps as string) : '',
        })),
      })),
    })
  }

  function addBlock(exerciseId: string) {
    setPicking(false)
    setDraft((d) => ({ ...d, blocks: [...d.blocks, { key: uid(), exerciseId, sets: [emptySet()] }] }))
  }

  function moveBlock(key: string, delta: number) {
    setDraft((d) => {
      const i = d.blocks.findIndex((b) => b.key === key)
      const j = i + delta
      if (i < 0 || j < 0 || j >= d.blocks.length) return d
      const blocks = [...d.blocks]
      ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
      return { ...d, blocks }
    })
  }

  function validate(): string | null {
    if (!draft.performedOn) return 'Indique la date de la séance.'
    for (const b of draft.blocks) {
      const name = exerciseById.get(b.exerciseId)?.name ?? 'un exercice'
      for (const s of b.sets) {
        if (s.reps.trim() === '' && s.weight.trim() !== '') return `Il manque le nombre de répétitions sur une série de ${name}.`
        if (s.reps.trim() !== '' && !/^\d+$/.test(s.reps.trim())) return `Répétitions invalides sur ${name}.`
        if (s.weight.trim() !== '' && parseDecimal(s.weight) === null) return `Charge invalide sur ${name}.`
      }
    }
    if (draftToSets(draft).length === 0) return 'Ajoute au moins une série avec ses répétitions.'
    return null
  }

  async function save() {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await store.saveWorkout(draft, id)
      if (isNew) writeLocal(WORKOUT_DRAFT_KEY, null)
      toast('Séance enregistrée')
      navigate('muscu', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !window.confirm('Supprimer cette séance ? Cette action est définitive.')) return
    setBusy(true)
    try {
      await store.deleteWorkout(id)
      toast('Séance supprimée')
      navigate('muscu', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  function discard() {
    if (!window.confirm('Abandonner cette séance ? Ce qui a été saisi sera effacé.')) return
    writeLocal(WORKOUT_DRAFT_KEY, null)
    navigate('muscu', { replace: true })
  }

  const valid = draftToSets(draft)
  const volume = valid.reduce((s, r) => s + r.reps * r.weight_kg, 0)

  return (
    <main className="screen editor">
      <EditorHeader
        title={isNew ? 'Nouvelle séance' : 'Séance'}
        backTo="muscu"
        action={
          !isNew && (
            <button type="button" className="icon-btn danger" onClick={remove} aria-label="Supprimer la séance" disabled={busy}>
              <Icon name="trash" />
            </button>
          )
        }
      />

      <div className="form-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" value={draft.performedOn} onChange={(e) => update({ performedOn: e.target.value })} />
        </label>
        <label className="field">
          <span>Nom (facultatif)</span>
          <input
            type="text"
            placeholder="Ex. Bas du corps"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </label>
      </div>
      <p className="muted date-line">{draft.performedOn && fmtDateLong(draft.performedOn)}</p>

      {draft.blocks.length === 0 && templates.length > 0 && (
        <section className="section">
          <h2>Partir d’un modèle</h2>
          <div className="chips">
            {templates.map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => applyTemplate(t)}>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {draft.blocks.map((block, index) => {
        const ex = exerciseById.get(block.exerciseId)
        const last = lastByExercise.get(block.exerciseId) ?? null
        const ph = (i: number) => (last ? last.sets[Math.min(i, last.sets.length - 1)] : null)
        return (
          <section key={block.key} className="block-card">
            <div className="block-head">
              <div>
                <h3>{ex?.name ?? 'Exercice supprimé'}</h3>
                <p className="block-last">{last ? `Dernière fois : ${summarize(last)}` : 'Première fois sur cet exercice'}</p>
              </div>
              <div className="block-tools">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => moveBlock(block.key, -1)}
                  disabled={index === 0}
                  aria-label="Monter l’exercice"
                >
                  <Icon name="up" size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => moveBlock(block.key, 1)}
                  disabled={index === draft.blocks.length - 1}
                  aria-label="Descendre l’exercice"
                >
                  <Icon name="down" size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => update({ blocks: draft.blocks.filter((b) => b.key !== block.key) })}
                  aria-label="Retirer l’exercice"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            <div className="set-table" role="table" aria-label={`Séries de ${ex?.name ?? 'l’exercice'}`}>
              <div className="set-row set-row-head" role="row">
                <span role="columnheader">Série</span>
                <span role="columnheader">Reps</span>
                <span role="columnheader">Kg</span>
                <span role="columnheader">RIR</span>
                <span role="columnheader" className="visually-hidden">
                  Retirer
                </span>
              </div>
              {block.sets.map((s, i) => {
                const p = ph(i)
                const setField = (patch: Partial<SetDraft>) =>
                  updateBlock(block.key, (b) => ({
                    ...b,
                    sets: b.sets.map((x) => (x.key === s.key ? { ...x, ...patch } : x)),
                  }))
                return (
                  <div key={s.key} className="set-row" role="row">
                    <span className="set-num" role="cell">
                      {i + 1}
                    </span>
                    <input
                      role="cell"
                      aria-label={`Répétitions série ${i + 1}`}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={p ? String(p.reps) : ''}
                      value={s.reps}
                      onChange={(e) => setField({ reps: e.target.value.replace(/[^\d]/g, '') })}
                    />
                    <input
                      role="cell"
                      aria-label={`Charge en kg série ${i + 1}`}
                      inputMode="decimal"
                      placeholder={p ? toInput(p.weight_kg) : ''}
                      value={s.weight}
                      onChange={(e) => setField({ weight: e.target.value.replace(/[^\d.,]/g, '') })}
                    />
                    <select
                      role="cell"
                      aria-label={`RIR série ${i + 1}`}
                      value={s.rir}
                      onChange={(e) => setField({ rir: e.target.value })}
                    >
                      <option value="">–</option>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      role="cell"
                      className="icon-btn"
                      aria-label={`Retirer la série ${i + 1}`}
                      onClick={() => updateBlock(block.key, (b) => ({ ...b, sets: b.sets.filter((x) => x.key !== s.key) }))}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="block-actions">
              <button
                type="button"
                className="btn btn-quiet btn-small"
                onClick={() =>
                  updateBlock(block.key, (b) => {
                    const prev = b.sets[b.sets.length - 1]
                    return { ...b, sets: [...b.sets, prev ? { ...prev, key: uid() } : emptySet()] }
                  })
                }
                aria-label="Ajouter une série"
              >
                <Icon name="plus" size={16} />
                Série
              </button>
              {last && (
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() =>
                    updateBlock(block.key, (b) => ({
                      ...b,
                      sets: last.sets.map((x) => ({
                        key: uid(),
                        reps: String(x.reps),
                        weight: toInput(x.weight_kg),
                        rir: '',
                      })),
                    }))
                  }
                >
                  <Icon name="copy" size={16} />
                  Comme la dernière fois
                </button>
              )}
            </div>
          </section>
        )
      })}

      <button type="button" className="btn btn-outline btn-block add-exercise" onClick={() => setPicking(true)}>
        <Icon name="plus" size={18} />
        Ajouter un exercice
      </button>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          placeholder="Sensations, douleurs, matériel…"
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>

      {isNew && draft.blocks.length > 0 && (
        <button type="button" className="btn btn-text danger" onClick={discard}>
          Abandonner cette séance
        </button>
      )}

      <div className="save-bar">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="save-bar-row">
          <span className="save-summary">
            {plural(valid.length, 'série')}
            <span className="muted">, {fmtInt(Math.round(volume))} kg</span>
          </span>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer la séance'}
          </button>
        </div>
      </div>

      {picking && <ExercisePicker onPick={addBlock} onClose={closePicker} />}
    </main>
  )
}
