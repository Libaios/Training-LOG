import { useStore } from '../lib/store'
import { answeredBy, requestState, requestTitle, stripSessionPrefix, waitingText, when } from '../lib/coachQueue'
import type { CoachRequest } from '../lib/types'
import { Icon } from './Icon'

/**
 * Un échange avec le coach : son titre en une ligne, le détail (ton message et la réponse) en l'ouvrant.
 * Utilisé dans l'onglet Coach et, sans le rappel de la séance, sous les séances de l'accueil.
 */
export function RequestRow({
  r,
  open,
  withSession = true,
}: {
  r: CoachRequest
  open?: boolean
  withSession?: boolean
}) {
  const { sessionById, coachFires } = useStore()
  const live = coachFires.find((f) => f.status === 'ok' && f.session_url)
  const session = withSession && r.session_id ? sessionById.get(r.session_id) : undefined
  const state = requestState(r)
  const by = answeredBy(r)
  return (
    <li>
      <details className="recap-row" open={open}>
        <summary>
          <span className="row-main">
            <span className="row-title">{requestTitle(r)}</span>
            <span className="row-sub">
              {when(r.created_at)}
              {session ? `, séance « ${session.title} »` : ''}
              {by && <span className={by.className}>{by.label}</span>}
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
          <p className="comment-me">{stripSessionPrefix(r.message)}</p>
          {state === 'traitee' ? (
            r.response && <p className="comment-coach">{r.response}</p>
          ) : (
            <p className="muted">
              {waitingText(r)}{' '}
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
