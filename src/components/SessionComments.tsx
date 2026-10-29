import { useState, type FormEvent, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { answeredBy, FIRE_TOAST, isRecent, requestState, stripSessionPrefix, waitingText } from '../lib/coachQueue'
import type { PlanSession } from '../lib/types'
import { Icon } from './Icon'
import { RequestRow } from './RequestRow'

/**
 * Commentaires sur une séance (« ce sera trop dur ? ») et réponses du coach, affichés sous la séance.
 * En récap (accueil), les échanges restent repliés derrière un bouton placé avec les actions (`children`) :
 * seul l'échange en cours ou tout juste répondu s'affiche d'office, pour voir la réponse arriver.
 */
export function SessionComments({
  session,
  limit = 3,
  recap = false,
  children,
}: {
  session: PlanSession
  limit?: number
  recap?: boolean
  children?: ReactNode
}) {
  const { coachRequests, sendCoachRequest } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const all = coachRequests.filter((r) => r.session_id === session.id)
  const thread = all.slice(0, limit).reverse()

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

  const form = (
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
  )

  if (recap) {
    const live = all[0] && (all[0].status !== 'traitee' || isRecent(all[0])) ? all[0] : undefined
    const label = all.length
      ? `${all.length} échange${all.length > 1 ? 's' : ''} avec le coach, en écrire un`
      : 'Commenter pour le coach'
    return (
      <>
        <div className="today-actions">
          {children}
          <button
            type="button"
            className={`btn btn-text comment-toggle${open ? ' is-open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={label}
            title={label}
          >
            <Icon name="message" size={20} />
            {all.length > 0 && <span className="comment-count">{all.length}</span>}
          </button>
        </div>
        {open ? (
          <div className="session-comments">
            {all.length > 0 && (
              <ul className="list compact comment-recap">
                {thread.map((r) => (
                  <RequestRow key={r.id} r={r} open={r === live} withSession={false} />
                ))}
              </ul>
            )}
            {form}
          </div>
        ) : (
          live && (
            <ul className="list compact comment-recap">
              <RequestRow r={live} open withSession={false} />
            </ul>
          )
        )}
      </>
    )
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
        form
      ) : (
        <button type="button" className="btn btn-text comment-open" onClick={() => setOpen(true)}>
          <Icon name="message" size={18} />
          Commenter
        </button>
      )}
    </div>
  )
}
