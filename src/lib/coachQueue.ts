import { useEffect } from 'react'
import { useStore } from './store'
import type { CoachRequest, FireStatus } from './types'

/** Message affiché après l'envoi, selon ce que la fonction serveur a fait. */
export const FIRE_TOAST: Record<FireStatus, string> = {
  answered: 'Le coach a répondu',
  daily_limit: 'Envoyé, limite du jour atteinte : réponse ce soir',
  fired: 'Envoyé, réponse dans quelques minutes',
  already_running: 'Envoyé, le coach le prend juste après',
  not_configured: 'Envoyé, réponse ce soir',
  nothing_pending: 'Envoyé',
  bad_code: 'Envoyé',
  no_app_code: 'Envoyé',
  rate_limited: 'Envoyé, beaucoup de messages d’un coup : réponse d’ici quelques minutes',
  error: 'Envoyé, le coach le prendra dès que possible',
}

export type RequestState = 'file' | 'en_cours' | 'traitee'

/** Où en est un message : en file d'attente, pris en charge par le coach, ou traité. */
export function requestState(r: CoachRequest): RequestState {
  if (r.status === 'traitee') return 'traitee'
  return r.claimed_at ? 'en_cours' : 'file'
}

/** Qui a répondu : l'API (réponse rapide) ou Claude (session longue, revue du soir, réponses d'avant l'API). */
export function answeredBy(r: CoachRequest): { label: string; className: string } | null {
  if (r.status !== 'traitee') return null
  return r.handler === 'api' ? { label: 'API', className: 'tag tag-api' } : { label: 'Claude', className: 'tag tag-claude' }
}

/** Texte d'attente : un message confié à Claude prend quelques minutes. */
export function waitingText(r: CoachRequest): string {
  if (r.handler === 'session') return 'Claude s’en occupe…'
  return requestState(r) === 'en_cours' ? 'Le coach répond…' : 'En attente du coach…'
}

/** Le message tel que le coureur l'a écrit (sans le rappel de la séance ajouté à l'envoi). */
export const stripSessionPrefix = (message: string) => message.replace(/^Sur la séance « .* » : /s, '')

const shorten = (text: string, max = 60) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')}…` : flat
}

/** Titre d'un échange dans le récap : celui écrit par le coach, sinon le début du message. */
export const requestTitle = (r: CoachRequest) => r.summary ?? shorten(stripSessionPrefix(r.message))

const dtf = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** Date et heure courtes (« 29 oct., 16:48 »). */
export const when = (iso: string) => dtf.format(new Date(iso))

/** Le dernier échange reste ouvert 10 min : la réponse s'affiche sans avoir à la chercher. */
export const isRecent = (r: CoachRequest) => Date.now() - new Date(r.created_at).getTime() < 10 * 60 * 1000

/**
 * Tant qu'un message attend : rafraîchit toutes les 15 s pour afficher la réponse dès qu'elle arrive,
 * et relance le coach si un message n'est toujours pas pris en charge après une minute
 * (la fonction serveur ne relance que si aucune session n'est en cours).
 */
export function useCoachQueue() {
  const { coachRequests, relaunchCoach, reload } = useStore()
  const waiting = coachRequests.filter((r) => r.status === 'en_attente')
  const hasWaiting = waiting.length > 0
  const oldestUnclaimed = waiting
    .filter((r) => !r.claimed_at)
    .reduce<number | null>((m, r) => {
      const t = new Date(r.created_at).getTime()
      return m === null || t < m ? t : m
    }, null)

  useEffect(() => {
    if (!hasWaiting) return
    const id = window.setInterval(() => void reload(), 15000)
    return () => window.clearInterval(id)
  }, [hasWaiting, reload])

  useEffect(() => {
    if (oldestUnclaimed === null) return
    const relaunch = () => void relaunchCoach().catch(() => {})
    const wait = Math.max(0, oldestUnclaimed + 60000 - Date.now())
    let interval: number | undefined
    const first = window.setTimeout(() => {
      relaunch()
      interval = window.setInterval(relaunch, 90000)
    }, wait)
    return () => {
      window.clearTimeout(first)
      if (interval) window.clearInterval(interval)
    }
  }, [oldestUnclaimed, relaunchCoach])
}
