import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/Layout'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import type { FireStatus } from '../lib/types'
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
  'Je pars en déplacement la semaine prochaine, adapte',
  'J’ai une petite douleur au mollet',
  'Je me sens en forme, on peut monter un peu',
  'Mets la partie course en vert au lieu du rouge',
  'Ajoute sur l’accueil le total de km du mois',
]

const FIRE_TOAST: Record<FireStatus, string> = {
  fired: 'Le coach s’en occupe : réponse dans quelques minutes',
  already_running: 'Le coach est déjà au travail, il traite aussi ce message',
  not_configured: 'Message envoyé, le coach le traitera ce soir',
  nothing_pending: 'Message envoyé',
  bad_code: 'Demande refusée',
  no_app_code: 'Demande refusée',
  error: 'Message enregistré. Si rien ne bouge, appuie sur Relancer',
}

const RELAUNCH_TOAST: Partial<Record<FireStatus, string>> = {
  fired: 'Coach relancé : réponse dans quelques minutes',
  nothing_pending: 'Plus rien en attente',
  error: 'Lancement impossible pour l’instant, réessaie dans un moment',
}

const LIVE_WINDOW_MS = 20 * 60 * 1000

export function Coach() {
  const { coachNotes, coachRequests, coachFires, sendCoachRequest, relaunchCoach, markNotesRead, reload } = useStore()
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
      const status = await sendCoachRequest(message)
      setMessage('')
      toast(FIRE_TOAST[status])
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function relaunch() {
    setBusy(true)
    try {
      const status = await relaunchCoach()
      toast(RELAUNCH_TOAST[status] ?? FIRE_TOAST[status])
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const pending = coachRequests.filter((r) => r.status === 'en_attente')
  const answered = coachRequests.filter((r) => r.status === 'traitee').slice(0, 5)

  // Un lancement réussi récent couvre les demandes envoyées avant lui (ou juste après).
  const lastFire = coachFires.find((f) => f.status === 'ok')
  const live =
    lastFire && Date.now() - new Date(lastFire.fired_at).getTime() < LIVE_WINDOW_MS ? lastFire : undefined
  const isCovered = (createdAt: string) =>
    !!live && new Date(live.fired_at).getTime() >= new Date(createdAt).getTime() - 120000

  // Tant que le coach travaille, on rafraîchit pour afficher sa réponse dès qu'elle arrive.
  const working = pending.some((r) => isCovered(r.created_at))
  useEffect(() => {
    if (!working) return
    const id = window.setInterval(() => void reload(), 15000)
    return () => window.clearInterval(id)
  }, [working, reload])

  return (
    <main className="screen">
      <PageHeader title="Coach" />
      <p className="muted">
        Écris ce que tu veux, le coach s’en occupe en quelques minutes : ton entraînement (imprévu, douleur, envie de
        changer de rythme) comme l’appli elle-même (couleurs, écrans, nouvelles fonctions). Chaque soir, il relit aussi
        tes sorties de la journée.
      </p>

      <form className="coach-form" onSubmit={send}>
        <label className="field">
          <span>Écrire au coach</span>
          <textarea
            rows={4}
            maxLength={2000}
            placeholder="Sensations, imprévus, ou ce que tu veux changer dans l’appli…"
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
                {isCovered(r.created_at) ? (
                  <span className="working">
                    <span className="spinner" aria-hidden />
                    Le coach s’en occupe…
                    {live?.session_url && (
                      <a href={live.session_url} target="_blank" rel="noreferrer">
                        Suivre en direct
                      </a>
                    )}
                  </span>
                ) : (
                  <span className="muted">Envoyé {when(r.created_at)}, pas encore pris en charge</span>
                )}
              </li>
            ))}
          </ul>
          {!working && (
            <button type="button" className="btn btn-quiet" onClick={() => void relaunch()} disabled={busy}>
              Relancer le coach
            </button>
          )}
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

      {config.coachChatUrl && (
        <a className="btn btn-text" href={config.coachChatUrl} target="_blank" rel="noreferrer">
          <Icon name="message" size={18} />
          Discuter avec le coach dans Claude
        </a>
      )}

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
