import { useState } from 'react'
import { EditorHeader, Empty } from '../components/Layout'
import { Icon } from '../components/Icon'
import { KeyPace, SessionSteps, SessionTag } from '../components/Session'
import { SessionComments } from '../components/SessionComments'
import { sessionTarget, weekLabel } from '../lib/coach'
import { useStore, type SessionPatch } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { addDays, fmt1, fmtClock, fmtDate, fmtDateLong, fmtPace, paceOf, parseDecimal, parseIntOrNull, toInput, todayISO, weekStart } from '../lib/format'
import { SESSION_TYPES, type PlanSession, type SessionType } from '../lib/types'
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

export function SessionDetail({ id }: { id?: string }) {
  const store = useStore()
  const toast = useToast()
  const session = id ? store.sessionById.get(id) : undefined
  const [editing, setEditing] = useState(!id)
  const [form, setForm] = useState<Form>(() => formFrom(session))
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
    if (session && form.type !== session.session_type) patch.structure = []
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
            <input inputMode="decimal" value={form.distance} onChange={(e) => update({ distance: e.target.value.replace(/[^\d.,]/g, '') })} />
          </label>
          <label className="field">
            <span>Durée (min)</span>
            <input inputMode="numeric" value={form.duration} onChange={(e) => update({ duration: e.target.value.replace(/[^\d]/g, '') })} />
          </label>
        </div>
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
        <button type="button" className="btn btn-outline btn-block" onClick={() => { setForm(formFrom(s)); setEditing(true) }}>
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
