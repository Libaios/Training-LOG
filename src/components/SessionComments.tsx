import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import type { FireStatus, PlanSession } from '../lib/types'
import { Icon } from './Icon'

const TOAST: Partial<Record<FireStatus, string>> = {
  fired: 'Envoyé : le coach te répond ici dans quelques minutes',
  already_running: 'Envoyé : le coach est déjà au travail, il le traite aussi',
}

/** Commentaires sur une séance (« ce sera trop dur ? ») et réponses du coach, affichés sous la séance. */
export function SessionComments({ session }: { session: PlanSession }) {
  const { coachRequests, sendCoachRequest, reload } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const thread = coachRequests.filter((r) => r.session_id === session.id).slice(0, 3).reverse()
  const waiting = thread.some((r) => r.status === 'en_attente' && Date.now() - new Date(r.created_at).getTime() < 20 * 60000)

  // Tant qu'une réponse est attendue, on rafraîchit pour l'afficher dès qu'elle arrive.
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(() => void reload(), 15000)
    return () => window.clearInterval(id)
  }, [waiting, reload])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      const status = await sendCoachRequest(`Sur la séance « ${session.title} » : ${text.trim()}`, session.id)
      setText('')
      setOpen(false)
      toast(TOAST[status] ?? 'Envoyé au coach')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="session-comments">
      {thread.map((r) => (
        <div key={r.id} className="comment">
          <p className="comment-me">{r.message.replace(/^Sur la séance « .* » : /, '')}</p>
          {r.response ? (
            <p className="comment-coach">{r.response}</p>
          ) : (
            <p className="working">
              <span className="spinner" aria-hidden />
              Le coach regarde…
            </p>
          )}
        </div>
      ))}
      {open ? (
        <form className="comment-form" onSubmit={send}>
          <label className="field">
            <span>Ton commentaire pour le coach</span>
            <textarea rows={2} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </label>
          <div className="comment-actions">
            <button type="submit" className="btn btn-primary btn-small" disabled={busy || !text.trim()}>
              Envoyer
            </button>
            <button type="button" className="btn btn-text btn-small" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-text comment-open" onClick={() => setOpen(true)}>
          <Icon name="message" size={18} />
          Commenter cette séance
        </button>
      )}
    </div>
  )
}
