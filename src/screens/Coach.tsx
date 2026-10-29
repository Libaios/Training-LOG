import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/Layout'
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

const dtf = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const when = (iso: string) => dtf.format(new Date(iso))

const PAGE = 15

type Item = { at: string; request?: CoachRequest; note?: CoachNote }

function Exchange({ r }: { r: CoachRequest }) {
  const { sessionById } = useStore()
  const session = r.session_id ? sessionById.get(r.session_id) : undefined
  const state = requestState(r)
  return (
    <li className="exchange">
      <div className="exchange-meta muted">
        {session ? (
          <a href={`#/seance/${session.id}`}>Séance : {session.title}</a>
        ) : (
          <span />
        )}
        <span>{when(r.created_at)}</span>
      </div>
      <p className="comment-me">{stripSessionPrefix(r.message)}</p>
      {state === 'traitee' ? (
        r.response && <p className="comment-coach">{r.response}</p>
      ) : (
        <p className="working">
          <span className="spinner" aria-hidden />
          {state === 'en_cours' ? 'Le coach répond…' : 'En attente du coach…'}
        </p>
      )}
    </li>
  )
}

function NoteItem({ n }: { n: CoachNote }) {
  return (
    <li>
      <article className={`note note-${n.kind}${n.read ? '' : ' is-new'}`}>
        <div className="note-head">
          <span className="stag stag-neutral">{KIND_LABEL[n.kind]}</span>
          <span className="muted">{when(n.created_at)}</span>
        </div>
        <h3>{n.title}</h3>
        <p className="note-body">{n.body}</p>
      </article>
    </li>
  )
}

export function Coach() {
  const { coachNotes, coachRequests, sendCoachRequest, markNotesRead } = useStore()
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(PAGE)
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

  // Un seul fil, du plus récent au plus ancien : tes messages avec la réponse, et les notes du coach.
  const items: Item[] = [
    ...coachRequests.map((r) => ({ at: r.created_at, request: r })),
    ...coachNotes.map((n) => ({ at: n.created_at, note: n })),
  ].sort((a, b) => b.at.localeCompare(a.at))

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

      {items.length > 0 && (
        <ul className="feed">
          {items.slice(0, shown).map((it) =>
            it.request ? <Exchange key={it.request.id} r={it.request} /> : <NoteItem key={it.note!.id} n={it.note!} />,
          )}
        </ul>
      )}
      {items.length > shown && (
        <button type="button" className="btn btn-text" onClick={() => setShown(shown + PAGE)}>
          Messages plus anciens
        </button>
      )}
    </main>
  )
}
