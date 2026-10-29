import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { FIRE_TOAST, requestState, stripSessionPrefix } from '../lib/coachQueue'
import type { CoachNote, CoachRequest } from '../lib/types'

const KIND_LABEL = {
  plan: 'Plan',
  bilan: 'Bilan',
  reprogrammation: 'Réajustement',
  conseil: 'Conseil',
} as const

const dtf = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const when = (iso: string) => dtf.format(new Date(iso))

const PAGE = 8

const shorten = (text: string, max = 60) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')}…` : flat
}

/** Une demande : son titre en une ligne, le détail (ton message et la réponse) en l'ouvrant. */
function RequestRow({ r }: { r: CoachRequest }) {
  const { sessionById, coachFires } = useStore()
  const live = coachFires.find((f) => f.status === 'ok' && f.session_url)
  const session = r.session_id ? sessionById.get(r.session_id) : undefined
  const state = requestState(r)
  const message = stripSessionPrefix(r.message)
  return (
    <li>
      <details className="recap-row">
        <summary>
          <span className="row-main">
            <span className="row-title">{r.summary ?? shorten(message)}</span>
            <span className="row-sub">
              {when(r.created_at)}
              {session ? `, séance « ${session.title} »` : ''}
            </span>
          </span>
          {state === 'traitee' ? (
            <span className="status status-faite" aria-label="Répondu">
              <Icon name="check" size={16} />
            </span>
          ) : (
            <span className="spinner" role="img" aria-label={state === 'en_cours' ? 'Le coach répond' : 'En attente'} />
          )}
        </summary>
        <div className="recap-detail">
          <p className="comment-me">{message}</p>
          {state === 'traitee' ? (
            r.response && <p className="comment-coach">{r.response}</p>
          ) : (
            <p className="muted">
              {state === 'en_cours' ? 'Le coach répond…' : 'En attente du coach…'}{' '}
              {live?.session_url && (
                <a href={live.session_url} target="_blank" rel="noreferrer">
                  Voir sa session
                </a>
              )}
            </p>
          )}
          {session && (
            <a className="btn btn-text btn-small" href={`#/seance/${session.id}`}>
              Voir la séance
            </a>
          )}
        </div>
      </details>
    </li>
  )
}

/** Un message du coach : son titre, le texte en l'ouvrant (ouvert d'office s'il est nouveau). */
function NoteRow({ n }: { n: CoachNote }) {
  return (
    <li>
      <details className={`recap-row${n.read ? '' : ' is-new'}`} open={!n.read}>
        <summary>
          <span className="row-main">
            <span className="row-title">{n.title}</span>
            <span className="row-sub">
              {KIND_LABEL[n.kind]}, {when(n.created_at)}
            </span>
          </span>
          <Icon name="chevron" size={18} />
        </summary>
        <div className="recap-detail">
          <p className="note-body">{n.body}</p>
        </div>
      </details>
    </li>
  )
}

export function Coach() {
  const { coachNotes, coachRequests, sendCoachRequest, markNotesRead } = useStore()
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [shownRequests, setShownRequests] = useState(PAGE)
  const [shownNotes, setShownNotes] = useState(PAGE)
  const marked = useRef(false)

  // Les messages affichés sont considérés comme lus (une seule fois par visite).
  const unreadIds = coachNotes.filter((n) => !n.read).map((n) => n.id)
  useEffect(() => {
    if (marked.current || !unreadIds.length) return
    marked.current = true
    void markNotesRead(unreadIds).catch(() => {})
  }, [unreadIds, markNotesRead])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    try {
      const status = await sendCoachRequest(message)
      setMessage('')
      toast(FIRE_TOAST[status])
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <PageHeader title="Coach" />

      <form className="coach-form" onSubmit={send}>
        <label className="field">
          <span className="visually-hidden">Message au coach</span>
          <textarea rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !message.trim()}>
          Envoyer
        </button>
      </form>

      {coachRequests.length > 0 && (
        <section className="section">
          <h2>Tes demandes</h2>
          <ul className="list compact">
            {coachRequests.slice(0, shownRequests).map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
          {coachRequests.length > shownRequests && (
            <button type="button" className="btn btn-text" onClick={() => setShownRequests(shownRequests + PAGE)}>
              Plus anciennes
            </button>
          )}
        </section>
      )}

      {coachNotes.length > 0 && (
        <section className="section">
          <h2>Messages du coach</h2>
          <ul className="list compact">
            {coachNotes.slice(0, shownNotes).map((n) => (
              <NoteRow key={n.id} n={n} />
            ))}
          </ul>
          {coachNotes.length > shownNotes && (
            <button type="button" className="btn btn-text" onClick={() => setShownNotes(shownNotes + PAGE)}>
              Plus anciens
            </button>
          )}
        </section>
      )}
    </main>
  )
}
