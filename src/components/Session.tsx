import { fmtRange, sessionTarget, useCoach } from '../lib/coach'
import { zoneLabel, type Zone } from '../lib/pace'
import { fmtDate, fmtWeekday, fromISODate } from '../lib/format'
import { useStore } from '../lib/store'
import { SESSION_KIND, sessionTone, sessionTypeLabel, type PlanSession, type StructureStep } from '../lib/types'
import { Icon } from './Icon'

/** Sans perf de référence, l'allure se donne au ressenti. */
const ZONE_FEEL: Record<Zone, string> = {
  X: 'Très facile',
  E: 'Facile, tu parles',
  S: 'Allure de course',
  T: 'Soutenu, phrases courtes',
  I: 'Dur, quelques mots',
  R: 'Vite et relâché',
}

export function SessionTag({ session }: { session: Pick<PlanSession, 'session_type'> }) {
  return <span className={`stag stag-${sessionTone(session.session_type)}`}>{sessionTypeLabel(session.session_type)}</span>
}

const STATUS_LABEL: Record<PlanSession['status'], string> = {
  prevue: 'Prévue',
  faite: 'Faite',
  modifiee: 'Modifiée',
  sautee: 'Sautée',
}

export function StatusMark({ session }: { session: PlanSession }) {
  return (
    <span className={`status status-${session.status}`} aria-label={STATUS_LABEL[session.status]} title={STATUS_LABEL[session.status]}>
      {session.status === 'faite' && <Icon name="check" size={16} />}
      {session.status === 'sautee' && <Icon name="close" size={14} />}
    </span>
  )
}

function stepDetail(step: StructureStep): string {
  const parts: string[] = []
  if (step.distance_km) parts.push(step.distance_km < 1 ? `${Math.round(step.distance_km * 1000)} m` : `${String(step.distance_km).replace('.', ',')} km`)
  if (step.duration_min) parts.push(`${step.duration_min} min`)
  return parts.join(', ')
}

/** Déroulé d'une séance avec les allures cibles calculées depuis le niveau actuel. */
export function SessionSteps({ steps }: { steps: StructureStep[] }) {
  const { paces } = useCoach()
  if (!steps.length) return null
  return (
    <ol className="steps">
      {steps.map((step, i) => {
        const detail = stepDetail(step)
        return (
          <li key={i} className={`step${step.zone ? ` step-${step.zone}` : ''}`}>
            <div className="step-main">
              <strong>{step.label}</strong>
              {detail && !step.label.includes(detail) && <span className="muted">{detail}</span>}
              {step.recovery && <span className="muted">Récup : {step.recovery}</span>}
            </div>
            {step.zone && (
              <div className="step-pace">
                <span className="step-zone">{zoneLabel(step.zone)}</span>
                {paces ? (
                  <span className="step-range">{fmtRange(paces[step.zone])} /km</span>
                ) : (
                  <span className="step-feel">{ZONE_FEEL[step.zone]}</span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Ligne de séance dans une liste (plan) : le jour seulement s'il est fixé. */
export function SessionRow({ session }: { session: PlanSession }) {
  const { runs } = useStore()
  const target = sessionTarget(session)
  const tone = sessionTone(session.session_type)
  const run = session.run_id ? runs.find((r) => r.id === session.run_id) : undefined
  return (
    <a className={`list-row session-row is-${session.status}`} href={`#/seance/${session.id}`}>
      {session.flexible ? (
        <span className={`date-chip kind-chip tone-${tone}`}>{SESSION_KIND[tone]}</span>
      ) : (
        <span className={`date-chip tone-${tone}`}>
          <span>{fmtWeekday(session.scheduled_on)}</span>
          <strong>{fromISODate(session.scheduled_on).getDate()}</strong>
        </span>
      )}
      <span className="row-main">
        <span className="row-title">{session.title}</span>
        <span className="row-sub">
          {run
            ? `Faite ${fmtDate(run.performed_on).toLowerCase()}`
            : `${sessionTypeLabel(session.session_type)}${target ? `, ${target}` : ''}`}
          {session.locked ? ', modifiée par toi' : ''}
        </span>
      </span>
      <StatusMark session={session} />
    </a>
  )
}
