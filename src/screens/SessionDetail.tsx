import { useState } from 'react'
import { EditorHeader, Empty } from '../components/Layout'
import { Icon } from '../components/Icon'
import { PaceInput, paceFromFields } from '../components/PaceInput'
import { KeyPace, keyStep, SessionSteps, SessionTag } from '../components/Session'
import { SessionComments } from '../components/SessionComments'
import { sessionTarget, weekLabel } from '../lib/coach'
import { useStore, type SessionPatch } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { addDays, fmt1, fmtClock, fmtDate, fmtDateLong, fmtPace, paceFields, paceOf, parseDecimal, parseIntOrNull, toInput, todayISO, weekStart } from '../lib/format'
import { SESSION_TYPES, sessionTone, type PlanSession, type SessionType, type StructureStep } from '../lib/types'
import { useToast } from '../lib/ui'
import { navigate } from '../lib/router'

type Form = {
  date: string
  flexible: boolean
  type: SessionType
  title: string
  distance: string
  duration: string
  description: string
}

const formFrom = (s?: PlanSession): Form => ({
  date: s?.scheduled_on ?? todayISO(),
  flexible: s?.flexible ?? true,
  type: s?.session_type ?? 'footing',
  title: s?.title ?? '',
  distance: s?.target_distance_km ? toInput(s.target_distance_km) : '',
  duration: s?.target_duration_min ? String(s.target_duration_min) : '',
  description: s?.description ?? '',
})

function paceFromForm(f: Form): number {
  const km = parseDecimal(f.distance)
  const min = parseIntOrNull(f.duration)
  return km && min ? (min * 60) / km : NaN
}

const isQuality = (type: SessionType) => ['quality', 'race'].includes(sessionTone(type))

/** Rythme affiché à l'ouverture de l'éditeur : l'allure fixée s'il y en a une, sinon distance et durée. */
function initialPace(s?: PlanSession) {
  const fixed = s ? keyStep(s.structure, isQuality(s.session_type))?.pace_sec : undefined
  return paceFields(fixed ?? paceFromForm(formFrom(s)))
}

const DEFAULT_ZONE: Record<SessionType, NonNullable<StructureStep['zone']>> = {
  footing: 'E',
  recuperation: 'X',
  sortie_longue: 'E',
  seuil: 'T',
  fractionne: 'I',
  allure_semi: 'S',
  cotes: 'R',
  test: 'S',
  course: 'S',
}

/**
 * Rythme saisi à la main : il devient l'allure fixée de la partie principale de la séance
 * (les parties en endurance d'une séance facile ou lente, la partie rapide d'une séance de qualité).
 * Rythme effacé : la séance revient aux allures calculées.
 */
function withPace(steps: StructureStep[], pace: number | null, type: SessionType, title: string, km: number | null): StructureStep[] {
  const sec = pace ? Math.round(pace) : null
  if (!steps.length) return sec ? [{ label: title, zone: DEFAULT_ZONE[type], ...(km ? { distance_km: km } : {}), pace_sec: sec }] : []
  const quality = isQuality(type)
  const key = keyStep(steps, quality)
  return steps.map((step) => {
    if (step !== key && (quality || step.zone !== 'E')) return step
    const { pace_sec: _old, ...rest } = step
    return sec ? { ...rest, pace_sec: sec } : rest
  })
}

export function SessionDetail({ id }: { id?: string }) {
  const store = useStore()
  const toast = useToast()
  const session = id ? store.sessionById.get(id) : undefined
  const [editing, setEditing] = useState(!id)
  const [form, setForm] = useState<Form>(() => formFrom(session))
  const [pace, setPace] = useState(() => initialPace(session))
  const [driver, setDriver] = useState<'duration' | 'pace'>('duration')
  // Rythme modifié à la main : il devient l'allure affichée de la séance.
  const [paceTouched, setPaceTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (id && !session) {
    if (store.loading) return null
    return (
      <main className="screen">
        <EditorHeader title="Séance" backTo="plan" />
        <Empty>Cette séance n’existe plus, le coach l’a peut-être remplacée.</Empty>
      </main>
    )
  }

  const run = session?.run_id ? store.runs.find((r) => r.id === session.run_id) : undefined
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  // Distance, durée, rythme : deux suffisent, le troisième se calcule.
  function updateDistance(distance: string) {
    const km = parseDecimal(distance)
    const p = paceFromFields(pace.min, pace.sec)
    if (driver === 'pace' && p && km) update({ distance, duration: String(Math.round((p * km) / 60)) })
    else {
      update({ distance })
      const min = parseIntOrNull(form.duration)
      if (km && min) setPace(paceFields((min * 60) / km))
    }
  }

  function updateDuration(duration: string) {
    setDriver('duration')
    const km = parseDecimal(form.distance)
    const min = parseIntOrNull(duration)
    const p = paceFromFields(pace.min, pace.sec)
    if (km && min) {
      update({ duration })
      setPace(paceFields((min * 60) / km))
    } else if (!form.distance.trim() && p && min) update({ duration, distance: toInput(Math.round(((min * 60) / p) * 10) / 10) })
    else update({ duration })
  }

  function updatePace(min: string, sec: string) {
    setPace({ min, sec })
    setDriver('pace')
    setPaceTouched(true)
    const p = paceFromFields(min, sec)
    const km = parseDecimal(form.distance)
    const duration = parseIntOrNull(form.duration)
    if (p && km) update({ duration: String(Math.round((p * km) / 60)) })
    else if (p && duration) update({ distance: toInput(Math.round(((duration * 60) / p) * 10) / 10) })
  }

  async function act(fn: () => Promise<unknown>, message: string, back?: string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      toast(message)
      if (back !== undefined) navigate(back, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!form.date) return setError('Indique la date.')
    if (!form.title.trim()) return setError('Donne un nom à la séance.')
    const distance = parseDecimal(form.distance)
    const duration = parseIntOrNull(form.duration)
    if (form.distance.trim() && (distance === null || distance <= 0)) return setError('Distance invalide.')
    if (form.duration.trim() && (duration === null || duration <= 0)) return setError('Durée invalide.')
    const patch: SessionPatch = {
      // Jour libre : rangée au dimanche de la semaine choisie.
      scheduled_on: form.flexible ? addDays(weekStart(form.date), 6) : form.date,
      flexible: form.flexible,
      session_type: form.type,
      title: form.title.trim(),
      target_distance_km: distance,
      target_duration_min: duration,
      description: form.description.trim() || null,
      locked: true,
    }
    // Un changement de type rend le déroulé prévu caduc.
    const typeChanged = !!session && form.type !== session.session_type
    const steps = typeChanged ? [] : (session?.structure ?? [])
    if (paceTouched) patch.structure = withPace(steps, paceFromFields(pace.min, pace.sec), form.type, form.title.trim(), distance)
    else if (typeChanged) patch.structure = []
    await act(async () => {
      const newId = await store.saveSession(patch, id)
      if (!id) navigate(`seance/${newId}`, { replace: true })
      setEditing(false)
    }, id ? 'Séance modifiée, le coach adaptera la suite' : 'Séance ajoutée')
  }

  if (editing) {
    return (
      <main className="screen editor">
        <EditorHeader
          title={id ? 'Modifier la séance' : 'Nouvelle séance'}
          backTo={id ? `seance/${id}` : 'plan'}
          backLabel="Annuler"
        />
        <div className="segmented" role="tablist" aria-label="Quand">
          <button type="button" role="tab" aria-selected={form.flexible} onClick={() => update({ flexible: true })}>
            Jour libre
          </button>
          <button type="button" role="tab" aria-selected={!form.flexible} onClick={() => update({ flexible: false })}>
            Jour précis
          </button>
        </div>
        {form.flexible ? (
          <>
            <div className="chips">
              {[0, 1, 2].map((n) => {
                const d = addDays(weekStart(todayISO()), n * 7 + 6)
                return (
                  <button key={n} type="button" className="chip" aria-pressed={weekStart(form.date) === weekStart(d)} onClick={() => update({ date: d })}>
                    {n === 0 ? 'Cette semaine' : n === 1 ? 'Semaine prochaine' : 'Dans 2 semaines'}
                  </button>
                )
              })}
            </div>
            <label className="field">
              <span>Ou une date</span>
              <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
            </label>
            <p className="muted date-line">{form.date && `Semaine ${weekLabel(form.date)}`}</p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
            </label>
            <div className="chips">
              {[0, 1, 2].map((n) => {
                const d = addDays(todayISO(), n)
                return (
                  <button key={n} type="button" className="chip" aria-pressed={form.date === d} onClick={() => update({ date: d })}>
                    {n === 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : 'Après-demain'}
                  </button>
                )
              })}
            </div>
            <p className="muted date-line">{form.date && fmtDateLong(form.date)}</p>
          </>
        )}
        <label className="field">
          <span>Type</span>
          <select value={form.type} onChange={(e) => update({ type: e.target.value as SessionType })}>
            {SESSION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {session && form.type !== session.session_type && session.structure.length > 0 && (
          <p className="muted date-line">Le déroulé détaillé prévu par le coach sera retiré.</p>
        )}
        <label className="field">
          <span>Nom</span>
          <input type="text" placeholder="Ex. Footing tranquille" value={form.title} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <div className="form-grid even">
          <label className="field">
            <span>Distance (km)</span>
            <input inputMode="decimal" value={form.distance} onChange={(e) => updateDistance(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
          <label className="field">
            <span>Durée (min)</span>
            <input inputMode="numeric" value={form.duration} onChange={(e) => updateDuration(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
        </div>
        <PaceInput min={pace.min} sec={pace.sec} onChange={updatePace} />
        <p className="muted field-hint">Deux champs sur trois suffisent : distance, durée ou rythme, le dernier se calcule.</p>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => update({ description: e.target.value })} />
        </label>
        <div className="save-bar">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="save-bar-row">
            <span />
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  const s = session!
  const target = sessionTarget(s)
  return (
    <main className="screen">
      <EditorHeader
        title="Séance"
        backTo="plan"
      />
      <div className="detail-head">
        <div className="chips">
          <SessionTag session={s} />
          {s.locked && <span className="stag stag-neutral">Modifiée par toi</span>}
        </div>
        <h1>{s.title}</h1>
        <p className="muted">
          {s.flexible ? `Semaine ${weekLabel(s.scheduled_on)}` : fmtDateLong(s.scheduled_on)}
          {target && s.status === 'faite' ? `. ${target}` : ''}
        </p>
      </div>
      {s.status !== 'faite' && <KeyPace session={s} />}
      {s.description && <p>{s.description}</p>}
      {(s.status === 'faite' || s.structure.length > 1) && <SessionSteps steps={s.structure} />}
      {s.coach_comment && <p className="coach-quote">{s.coach_comment}</p>}
      <SessionComments session={s} limit={50} />

      {run && (
        <a className="done-line" href={`#/course/${run.id}`}>
          <Icon name="check" size={18} />
          <span>
            Faite {fmtDate(run.performed_on).toLowerCase()} : {fmt1(run.distance_km)} km en {fmtClock(run.duration_sec)}, {fmtPace(paceOf(run.distance_km, run.duration_sec))} /km
            {run.rpe ? `, ressenti ${run.rpe}/10` : ''}
          </span>
        </a>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="stack">
        {s.status !== 'faite' && (
          <a className="btn btn-primary btn-block" href={`#/course/nouvelle/${s.id}`}>
            <Icon name="check" size={18} />
            Je l’ai faite
          </a>
        )}
        <button type="button" className="btn btn-outline btn-block" onClick={() => { setForm(formFrom(s)); setPace(initialPace(s)); setDriver('duration'); setPaceTouched(false); setEditing(true) }}>
          Modifier
        </button>
        {s.status === 'prevue' && (
          <button
            type="button"
            className="btn btn-quiet btn-block"
            disabled={busy}
            onClick={() => act(() => store.setSessionStatus(s.id, 'sautee'), 'Séance marquée sautée')}
          >
            Sauter
          </button>
        )}
        {s.status === 'sautee' && (
          <button
            type="button"
            className="btn btn-quiet btn-block"
            disabled={busy}
            onClick={() => act(() => store.setSessionStatus(s.id, 'prevue'), 'Séance remise au programme')}
          >
            Remettre au programme
          </button>
        )}
        {s.locked && (
          <button
            type="button"
            className="btn btn-text"
            disabled={busy}
            onClick={() => act(() => store.saveSession({ locked: false }, s.id), 'Le coach peut de nouveau l’ajuster')}
          >
            Laisser le coach l’ajuster de nouveau
          </button>
        )}
        <button
          type="button"
          className="btn btn-text danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Supprimer cette séance du plan ?')) void act(() => store.deleteSession(s.id), 'Séance supprimée', 'plan')
          }}
        >
          Supprimer du plan
        </button>
      </div>
    </main>
  )
}
