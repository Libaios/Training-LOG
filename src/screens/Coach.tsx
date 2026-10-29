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
  'Construis mon plan de préparation',
  'Je pars en déplacement la semaine prochaine, adapte',
  'J’ai une petite douleur au mollet',
  'Je me sens en forme, on peut monter un peu',
]

const FIRE_TOAST: Record<FireStatus, string> = {
  fired: 'Le coach s’en occupe : réponse dans quelques minutes',
  already_running: 'Le coach est déjà au travail, il traite aussi ce message',
  not_configured: 'Message envoyé, le coach le traitera ce soir',
  nothing_pending: 'Message envoyé',
  bad_code: 'Demande refusée',
  no_app_code: 'Demande refusée',
  error: 'Message envoyé, le coach le traitera ce soir',
}

const APP_TOAST: Partial<Record<FireStatus, string>> = {
  fired: 'Demande envoyée : l’appli sera mise à jour dans quelques minutes',
  already_running: 'Demande envoyée : elle sera traitée dans la foulée',
  error: 'Demande enregistrée, elle sera traitée au prochain lancement',
  not_configured: 'Demande enregistrée, le lancement immédiat n’est pas configuré',
}

const APP_SUGGESTIONS = ['Mets la partie course en vert au lieu du rouge', 'Agrandis le compte à rebours sur l’accueil']

type Mode = 'coach' | 'appli'

const LIVE_WINDOW_MS = 20 * 60 * 1000

export function Coach() {
  const { coachNotes, coachRequests, coachFires, sendCoachRequest, sendAppRequest, markNotesRead, reload } = useStore()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('coach')
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
      const status = mode === 'coach' ? await sendCoachRequest(message) : await sendAppRequest(message)
      setMessage('')
      toast(mode === 'appli' ? (APP_TOAST[status] ?? FIRE_TOAST[status]) : FIRE_TOAST[status])
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
        Écris ta demande ici : le coach la traite en quelques minutes. Il réajuste ton plan, et peut aussi modifier
        l’appli elle-même. Chaque soir, il relit tes sorties de la journée.
      </p>

      <form className="coach-form" onSubmit={send}>
        <div className="segmented" role="tablist" aria-label="Type de demande">
          <button type="button" role="tab" aria-selected={mode === 'coach'} onClick={() => setMode('coach')}>
            Entraînement
          </button>
          <button type="button" role="tab" aria-selected={mode === 'appli'} onClick={() => setMode('appli')}>
            Modifier l’appli
          </button>
        </div>
        <label className="field">
          <span>{mode === 'coach' ? 'Écrire au coach' : 'Ce que tu veux changer dans l’appli'}</span>
          <textarea
            rows={3}
            maxLength={2000}
            placeholder={
              mode === 'coach'
                ? 'Contraintes, sensations, imprévus, envie de changer quelque chose…'
                : 'Couleurs, textes, disposition d’un écran…'
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        {!message && (
          <div className="chips">
            {(mode === 'coach' ? SUGGESTIONS : APP_SUGGESTIONS).map((s) => (
              <button key={s} type="button" className="chip chip-small" onClick={() => setMessage(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {mode === 'appli' && (
          <p className="muted chart-note">
            Les changements d’apparence et de textes sont faits et publiés automatiquement. Les données, la sécurité et
            les gros changements restent à voir avec Claude.
          </p>
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
                {r.kind === 'appli' && <span className="stag stag-neutral request-kind">Modification de l’appli</span>}
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
                  <span className="muted">
                    Envoyé {when(r.created_at)}, {r.kind === 'appli' ? 'en attente du prochain lancement' : 'traité ce soir'}
                  </span>
                )}
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
                {r.kind === 'appli' && <span className="stag stag-neutral request-kind">Modification de l’appli</span>}
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
