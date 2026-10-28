import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { useStore } from '../lib/store'
import { errorMessage, supabase } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { paceOf, plural, todayISO } from '../lib/format'
import { runTypeLabel, type Exercise } from '../lib/types'

/* Export CSV pensé pour Excel en français : séparateur ; et virgule décimale. */
function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Settings({ email }: { email: string }) {
  const { exercises, templates, workouts, runs, exerciseById, addExercise, updateExercise } = useStore()
  const toast = useToast()
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState('')

  const active = exercises.filter((e) => !e.archived)
  const archived = exercises.filter((e) => e.archived)
  const groups = Array.from(new Set(exercises.map((e) => e.muscle_group).filter(Boolean) as string[])).sort()

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await addExercise(newName, newGroup)
      setNewName('')
      toast('Exercice ajouté')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  function exportWorkouts() {
    const rows = workouts
      .slice()
      .sort((a, b) => a.performed_on.localeCompare(b.performed_on))
      .flatMap((w) =>
        w.sets
          .slice()
          .sort((a, b) => a.position - b.position || a.set_number - b.set_number)
          .map((s) => [
            w.performed_on,
            w.title ?? '',
            exerciseById.get(s.exercise_id)?.name ?? '',
            s.set_number,
            s.reps,
            s.weight_kg,
            s.rir,
            w.notes ?? '',
          ]),
      )
    downloadCsv(`muscu-${todayISO()}.csv`, ['Date', 'Séance', 'Exercice', 'Série', 'Reps', 'Charge (kg)', 'RIR', 'Notes'], rows)
  }

  function exportRuns() {
    const rows = runs
      .slice()
      .sort((a, b) => a.performed_on.localeCompare(b.performed_on))
      .map((r) => [
        r.performed_on,
        runTypeLabel(r.run_type),
        r.distance_km,
        r.duration_sec,
        Math.round(paceOf(r.distance_km, r.duration_sec)),
        r.avg_hr,
        r.notes ?? '',
      ])
    downloadCsv(
      `course-${todayISO()}.csv`,
      ['Date', 'Type', 'Distance (km)', 'Durée (s)', 'Allure (s/km)', 'FC moyenne', 'Notes'],
      rows,
    )
  }

  return (
    <main className="screen">
      <PageHeader title="Réglages" />

      <section className="section">
        <div className="section-head">
          <h2>Modèles de séance</h2>
          <a className="btn btn-quiet btn-small" href="#/reglages/modele/nouveau">
            <Icon name="plus" size={16} />
            Nouveau modèle
          </a>
        </div>
        {templates.length === 0 ? (
          <p className="muted">
            Un modèle pré-remplit une séance avec ses exercices et le nombre de séries. Pratique pour un programme
            Push, Pull, Jambes par exemple.
          </p>
        ) : (
          <ul className="list">
            {templates.map((t) => (
              <li key={t.id}>
                <a className="list-row" href={`#/reglages/modele/${t.id}`}>
                  <span className="row-main">
                    <span className="row-title">{t.name}</span>
                    <span className="row-sub row-clip">
                      {t.items
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((it) => exerciseById.get(it.exercise_id)?.name)
                        .filter(Boolean)
                        .join(', ') || 'Aucun exercice'}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Exercices</h2>
        <form className="inline-form" onSubmit={create}>
          <input
            type="text"
            placeholder="Nouvel exercice"
            aria-label="Nom du nouvel exercice"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)} aria-label="Groupe musculaire">
            <option value="">Groupe</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-small" disabled={!newName.trim()}>
            Ajouter
          </button>
        </form>
        <ul className="list compact">
          {active.map((e) => (
            <ExerciseRow key={e.id} exercise={e} groups={groups} onUpdate={updateExercise} />
          ))}
        </ul>
        {archived.length > 0 && (
          <>
            <button type="button" className="btn btn-text" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Cacher' : 'Afficher'} les exercices masqués ({archived.length})
            </button>
            {showArchived && (
              <ul className="list compact">
                {archived.map((e) => (
                  <ExerciseRow key={e.id} exercise={e} groups={groups} onUpdate={updateExercise} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="section">
        <h2>Données</h2>
        <p className="muted">Fichiers CSV lisibles directement dans Excel.</p>
        <div className="button-row">
          <button type="button" className="btn btn-outline" onClick={exportWorkouts} disabled={!workouts.length}>
            Exporter la muscu ({plural(workouts.length, 'séance')})
          </button>
          <button type="button" className="btn btn-outline" onClick={exportRuns} disabled={!runs.length}>
            Exporter la course ({plural(runs.length, 'sortie')})
          </button>
        </div>
      </section>

      <AccountSection email={email} />
    </main>
  )
}

function ExerciseRow({
  exercise,
  groups,
  onUpdate,
}: {
  exercise: Exercise
  groups: string[]
  onUpdate: (id: string, patch: Partial<Pick<Exercise, 'name' | 'muscle_group' | 'archived'>>) => Promise<void>
}) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(exercise.name)
  const [group, setGroup] = useState(exercise.muscle_group ?? '')

  useEffect(() => {
    setName(exercise.name)
    setGroup(exercise.muscle_group ?? '')
  }, [exercise])

  async function run(patch: Partial<Pick<Exercise, 'name' | 'muscle_group' | 'archived'>>, message: string) {
    try {
      await onUpdate(exercise.id, patch)
      setEditing(false)
      toast(message)
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  if (!editing) {
    return (
      <li className="exercise-row">
        <button type="button" className="exercise-name" onClick={() => setEditing(true)}>
          <span>{exercise.name}</span>
          {exercise.muscle_group && <span className="muted">{exercise.muscle_group}</span>}
        </button>
      </li>
    )
  }

  return (
    <li className="exercise-row is-editing">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom de l’exercice" />
      <input
        type="text"
        list="muscle-groups"
        value={group}
        onChange={(e) => setGroup(e.target.value)}
        placeholder="Groupe musculaire"
        aria-label="Groupe musculaire"
      />
      <datalist id="muscle-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="button-row">
        <button
          type="button"
          className="btn btn-primary btn-small"
          disabled={!name.trim()}
          onClick={() => run({ name: name.trim(), muscle_group: group.trim() || null }, 'Exercice modifié')}
        >
          Enregistrer
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={() =>
            run(
              { archived: !exercise.archived },
              exercise.archived ? 'Exercice de nouveau visible' : 'Exercice masqué',
            )
          }
        >
          {exercise.archived ? 'Afficher' : 'Masquer'}
        </button>
        <button type="button" className="btn btn-text btn-small" onClick={() => setEditing(false)}>
          Annuler
        </button>
      </div>
    </li>
  )
}

function AccountSection({ email }: { email: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Choisis au moins 8 caractères.')
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.')
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(errorMessage(err))
    setPassword('')
    setConfirm('')
    setOpen(false)
    toast('Mot de passe modifié')
  }

  return (
    <section className="section">
      <h2>Compte</h2>
      <p className="muted">Connecté avec {email}</p>
      {open ? (
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Confirmer</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Changer le mot de passe
            </button>
            <button type="button" className="btn btn-text" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className="button-row">
          <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
            Changer le mot de passe
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>
            Se déconnecter
          </button>
        </div>
      )}
    </section>
  )
}
