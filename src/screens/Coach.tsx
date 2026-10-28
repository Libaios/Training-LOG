import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/Layout'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { Icon } from '../components/Icon'
import config from '../../app.config.json'

const KIND_LABEL = {
  plan: 'Plan',
  bilan: 'Bilan',
  reprogrammation: 'Réajustement',
  conseil: 'Conseil',
} as const

const dtf = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const when = (iso: string) => dtf.format(new Date(iso))

const SUGGESTIONS = [
  'Construis mon plan de préparation',
  'Je pars en déplacement la semaine prochaine, adapte',
  'J’ai une petite douleur au mollet',
  'Je me sens en forme, on peut monter un peu',
]

export function Coach() {
  const { coachNotes, coachRequests, sendCoachRequest, markNotesRead } = useStore()
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
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
      await sendCoachRequest(message)
      setMessage('')
      toast('Message envoyé au coach')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const pending = coachRequests.filter((r) => r.status === 'en_attente')
  const answered = coachRequests.filter((r) => r.status === 'traitee').slice(0, 5)

  return (
    <main className="screen">
      <PageHeader title="Coach" />
      <p className="muted">
        Chaque soir, le coach relit tes sorties et tes messages, puis réajuste les séances à venir. Pour un réajustement
        immédiat, écris-lui directement dans Claude : il a accès à ton plan et le modifie en direct.
      </p>
      {config.coachChatUrl && (
        <a className="btn btn-primary btn-block" href={config.coachChatUrl} target="_blank" rel="noreferrer">
          <Icon name="message" size={18} />
          Parler au coach maintenant
        </a>
      )}

      <form className="coach-form" onSubmit={send}>
        <label className="field">
          <span>Écrire au coach</span>
          <textarea
            rows={3}
            maxLength={2000}
            placeholder="Contraintes, sensations, imprévus, envie de changer quelque chose…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        {!message && (
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip chip-small" onClick={() => setMessage(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !message.trim()}>
          Envoyer
        </button>
      </form>

      {pending.length > 0 && (
        <section className="section">
          <h2>En attente</h2>
          <ul className="list compact">
            {pending.map((r) => (
              <li key={r.id} className="request">
                <p>{r.message}</p>
                <span className="muted">Envoyé {when(r.created_at)}, traité ce soir</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Messages du coach</h2>
        {coachNotes.length === 0 ? (
          <p className="muted">Rien pour l’instant. Le premier message arrivera avec ton plan.</p>
        ) : (
          <div className="notes">
            {coachNotes.map((n) => (
              <article key={n.id} className={`note note-${n.kind}${n.read ? '' : ' is-new'}`}>
                <div className="note-head">
                  <span className="stag stag-neutral">{KIND_LABEL[n.kind]}</span>
                  <span className="muted">{when(n.created_at)}</span>
                </div>
                <h3>{n.title}</h3>
                <p className="note-body">{n.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {answered.length > 0 && (
        <section className="section">
          <h2>Tes derniers messages</h2>
          <ul className="list compact">
            {answered.map((r) => (
              <li key={r.id} className="request">
                <p>{r.message}</p>
                {r.response && <p className="request-response">{r.response}</p>}
                <span className="muted">{when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
