import { useState, type FormEvent } from 'react'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { answeredBy, FIRE_TOAST, requestState, stripSessionPrefix, waitingText } from '../lib/coachQueue'
import type { PlanSession } from '../lib/types'
import { Icon } from './Icon'

/** Commentaires sur une séance (« ce sera trop dur ? ») et réponses du coach, affichés sous la séance. */
export function SessionComments({ session, limit = 3 }: { session: PlanSession; limit?: number }) {
  const { coachRequests, sendCoachRequest } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const thread = coachRequests.filter((r) => r.session_id === session.id).slice(0, limit).reverse()

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      const status = await sendCoachRequest(`Sur la séance « ${session.title} » : ${text.trim()}`, session.id, () => {
        setText('')
        setOpen(false)
      })
      toast(FIRE_TOAST[status])
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="session-comments">
      {thread.map((r) => {
        const by = answeredBy(r)
        return (
          <div key={r.id} className="comment">
            <p className="comment-me">{stripSessionPrefix(r.message)}</p>
            {requestState(r) === 'traitee' ? (
              r.response && (
                <p className="comment-coach">
                  {r.response}
                  {by && <span className={by.className}>{by.label}</span>}
                </p>
              )
            ) : (
              <p className="working">
                <span className="spinner" aria-hidden />
                {waitingText(r)}
              </p>
            )}
          </div>
        )
      })}
      {open ? (
        <form className="comment-form" onSubmit={send}>
          <label className="field">
            <span className="visually-hidden">Commentaire pour le coach</span>
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
          Commenter
        </button>
      )}
    </div>
  )
}
