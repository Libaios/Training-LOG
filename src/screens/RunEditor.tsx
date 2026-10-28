import { useEffect, useState } from 'react'
import { EditorHeader, Empty } from '../components/Layout'
import { Icon } from '../components/Icon'
import { runDraftDuration, useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { fmt1, fmtDateLong, fmtPace, parseDecimal, parseIntOrNull, toInput, todayISO } from '../lib/format'
import { RUN_TYPES, type Run, type RunDraft } from '../lib/types'
import { useToast } from '../lib/ui'
import { navigate } from '../lib/router'

function draftFromRun(r: Run): RunDraft {
  return {
    performedOn: r.performed_on,
    runType: r.run_type,
    distance: toInput(r.distance_km),
    hours: r.duration_sec >= 3600 ? String(Math.floor(r.duration_sec / 3600)) : '',
    minutes: String(Math.floor((r.duration_sec % 3600) / 60)),
    seconds: String(r.duration_sec % 60),
    avgHr: r.avg_hr === null ? '' : String(r.avg_hr),
    notes: r.notes ?? '',
  }
}

const newDraft = (): RunDraft => ({
  performedOn: todayISO(),
  runType: 'endurance',
  distance: '',
  hours: '',
  minutes: '',
  seconds: '',
  avgHr: '',
  notes: '',
})

export function RunEditor({ id }: { id?: string }) {
  const store = useStore()
  const toast = useToast()
  const existing = id ? store.runs.find((r) => r.id === id) : undefined
  const isNew = !id
  const [draft, setDraft] = useState<RunDraft>(() => (existing ? draftFromRun(existing) : newDraft()))
  const [loadedId, setLoadedId] = useState<string | undefined>(existing?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existing && loadedId !== existing.id) {
      setDraft(draftFromRun(existing))
      setLoadedId(existing.id)
    }
  }, [existing, loadedId])

  if (!isNew && !existing) {
    if (store.loading) return null
    return (
      <main className="screen">
        <EditorHeader title="Sortie" backTo="course" />
        <Empty>Cette sortie n’existe plus.</Empty>
      </main>
    )
  }

  const update = (patch: Partial<RunDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const distance = parseDecimal(draft.distance)
  const duration = runDraftDuration(draft)
  const pace = distance && duration ? duration / distance : NaN
  const speed = distance && duration ? distance / (duration / 3600) : NaN

  function validate(): string | null {
    if (!draft.performedOn) return 'Indique la date de la sortie.'
    if (distance === null || distance <= 0) return 'Indique la distance en kilomètres.'
    if (duration <= 0) return 'Indique la durée de la sortie.'
    if ((parseIntOrNull(draft.minutes) ?? 0) > 59 || (parseDecimal(draft.seconds) ?? 0) >= 60)
      return 'Les minutes et les secondes vont de 0 à 59.'
    const hr = parseIntOrNull(draft.avgHr)
    if (draft.avgHr.trim() && (hr === null || hr < 30 || hr > 250)) return 'Fréquence cardiaque invalide.'
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
      await store.saveRun(draft, id)
      toast('Sortie enregistrée')
      navigate('course', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !window.confirm('Supprimer cette sortie ? Cette action est définitive.')) return
    setBusy(true)
    try {
      await store.deleteRun(id)
      toast('Sortie supprimée')
      navigate('course', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const digits = (v: string) => v.replace(/[^\d]/g, '')

  return (
    <main className="screen editor editor-run">
      <EditorHeader
        title={isNew ? 'Nouvelle sortie' : 'Sortie'}
        backTo="course"
        action={
          !isNew && (
            <button type="button" className="icon-btn danger" onClick={remove} aria-label="Supprimer la sortie" disabled={busy}>
              <Icon name="trash" />
            </button>
          )
        }
      />

      <label className="field">
        <span>Date</span>
        <input type="date" value={draft.performedOn} onChange={(e) => update({ performedOn: e.target.value })} />
      </label>
      <p className="muted date-line">{draft.performedOn && fmtDateLong(draft.performedOn)}</p>

      <fieldset className="field">
        <legend>Type de sortie</legend>
        <div className="chips">
          {RUN_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className="chip chip-run"
              aria-pressed={draft.runType === t.value}
              onClick={() => update({ runType: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Distance (km)</span>
        <input
          inputMode="decimal"
          placeholder="Ex. 8,5"
          value={draft.distance}
          onChange={(e) => update({ distance: e.target.value.replace(/[^\d.,]/g, '') })}
        />
      </label>

      <fieldset className="field">
        <legend>Durée</legend>
        <div className="duration">
          <label>
            <input inputMode="numeric" placeholder="0" value={draft.hours} onChange={(e) => update({ hours: digits(e.target.value) })} />
            <span>h</span>
          </label>
          <label>
            <input
              inputMode="numeric"
              placeholder="00"
              value={draft.minutes}
              onChange={(e) => update({ minutes: digits(e.target.value) })}
            />
            <span>min</span>
          </label>
          <label>
            <input
              inputMode="numeric"
              placeholder="00"
              value={draft.seconds}
              onChange={(e) => update({ seconds: digits(e.target.value) })}
            />
            <span>s</span>
          </label>
        </div>
      </fieldset>

      <div className="pace-readout" aria-live="polite">
        <div>
          <span className="pace-value">{fmtPace(pace)}</span>
          <span className="pace-unit">min/km</span>
        </div>
        <div>
          <span className="pace-value pace-secondary">{Number.isFinite(speed) ? fmt1(speed) : '–'}</span>
          <span className="pace-unit">km/h</span>
        </div>
      </div>

      <label className="field">
        <span>Fréquence cardiaque moyenne (facultatif)</span>
        <input
          inputMode="numeric"
          placeholder="Ex. 152"
          value={draft.avgHr}
          onChange={(e) => update({ avgHr: digits(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          placeholder="Parcours, sensations, détail du fractionné…"
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>

      <div className="save-bar">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="save-bar-row">
          <span className="save-summary muted">{draft.distance ? `${draft.distance} km` : ''}</span>
          <button type="button" className="btn btn-run" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer la sortie'}
          </button>
        </div>
      </div>
    </main>
  )
}
