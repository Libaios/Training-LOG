import { useState } from 'react'
import { Empty, PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { SessionRow } from '../components/Session'
import { groupByWeek, plannedKm, runsKmBetween, sessionTimeSec, useCoach, WEEK_RULES } from '../lib/coach'
import { useStore } from '../lib/store'
import { addDays, fmt1, fmtDateShort, fmtMinutes, todayISO, weekStart } from '../lib/format'
import { phaseLabel } from '../lib/types'

export function Plan() {
  const { plan, runs } = useStore()
  const { paces } = useCoach()
  const [showPast, setShowPast] = useState(false)
  const currentMonday = weekStart(todayISO())
  const weeks = groupByWeek(plan)
  const past = weeks.filter((w) => w.monday < currentMonday)
  const visible = showPast ? weeks : weeks.filter((w) => w.monday >= currentMonday)
  const maxKm = Math.max(1, ...weeks.map((w) => plannedKm(w.sessions)))

  return (
    <main className="screen">
      <PageHeader
        title="Plan"
        action={
          <a className="btn btn-quiet btn-small" href="#/seance/nouvelle">
            <Icon name="plus" size={16} />
            Ajouter
          </a>
        }
      />
      {plan.length > 0 && (
        <details className="fold">
          <summary>Les règles</summary>
          <ul className="rules-list">
            {WEEK_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      {plan.length === 0 ? (
        <Empty
          action={
            <a className="btn btn-primary" href="#/coach">
              Demander le plan au coach
            </a>
          }
        >
          Pas encore de plan.
        </Empty>
      ) : (
        <>
          {past.length > 0 && (
            <button type="button" className="btn btn-text" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Masquer' : 'Voir'} les semaines passées
            </button>
          )}
          {visible.map((w) => {
            const km = plannedKm(w.sessions)
            const time = w.sessions
              .filter((s) => s.status !== 'sautee')
              .reduce((sum, s) => sum + (sessionTimeSec(s, paces) ?? 0), 0)
            const done = runsKmBetween(runs, w.monday, addDays(w.monday, 7))
            const isCurrent = w.monday === currentMonday
            const phase = w.sessions.find((s) => s.phase)?.phase ?? null
            const number = w.sessions.find((s) => s.week_number)?.week_number
            return (
              <section key={w.monday} className={`section plan-week${isCurrent ? ' is-current' : ''}`}>
                <div className="plan-week-head">
                  <div>
                    <h2>
                      {number ? `Semaine ${number}` : 'Semaine'}
                      {isCurrent && <span className="now-tag">en cours</span>}
                    </h2>
                    <p className="muted">
                      {fmtDateShort(w.monday)} au {fmtDateShort(addDays(w.monday, 6))}
                      {phase ? `, ${phaseLabel(phase).toLowerCase()}` : ''}
                    </p>
                  </div>
                  <div className="plan-week-km">
                    <strong>{fmt1(km)} km</strong>
                    {time > 0 && <span className="muted">environ {fmtMinutes(time)}</span>}
                    {w.monday <= currentMonday && <span className="muted">{fmt1(done)} faits</span>}
                  </div>
                </div>
                <div className="km-bar" aria-hidden>
                  <span style={{ width: `${Math.round((km / maxKm) * 100)}%` }} />
                </div>
                <ul className="list compact">
                  {w.sessions.map((s) => (
                    <li key={s.id}>
                      <SessionRow session={s} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </main>
  )
}
