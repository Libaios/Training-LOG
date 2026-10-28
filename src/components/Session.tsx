import { fmtRange, sessionTarget, useCoach } from '../lib/coach'
import { zoneLabel } from '../lib/pace'
import { fmtWeekday, fromISODate } from '../lib/format'
import { sessionTone, sessionTypeLabel, type PlanSession, type StructureStep } from '../lib/types'
import { Icon } from './Icon'

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
                <span className="step-range">{paces ? `${fmtRange(paces[step.zone])} /km` : 'Allure à définir'}</span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Ligne de séance dans une liste (plan, semaine). */
export function SessionRow({ session }: { session: PlanSession }) {
  const target = sessionTarget(session)
  return (
    <a className={`list-row session-row is-${session.status}`} href={`#/seance/${session.id}`}>
      <span className={`date-chip tone-${sessionTone(session.session_type)}`}>
        <span>{fmtWeekday(session.scheduled_on)}</span>
        <strong>{fromISODate(session.scheduled_on).getDate()}</strong>
      </span>
      <span className="row-main">
        <span className="row-title">{session.title}</span>
        <span className="row-sub">
          {sessionTypeLabel(session.session_type)}
          {target ? `, ${target}` : ''}
          {session.locked ? ', modifiée par toi' : ''}
        </span>
      </span>
      <StatusMark session={session} />
    </a>
  )
}
