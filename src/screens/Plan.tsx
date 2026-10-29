import { useState } from 'react'
import { Empty, PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { SessionRow } from '../components/Session'
import { daysUntil, groupByWeek, plannedKm, runsKmBetween, WEEK_RULES } from '../lib/coach'
import { useStore } from '../lib/store'
import { addDays, fmt1, fmtDateLong, fmtDateShort, todayISO, weekStart } from '../lib/format'
import { phaseLabel } from '../lib/types'

export function Plan() {
  const { plan, runs, profile } = useStore()
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
      {profile && plan.length > 0 && (
        <>
          <p className="muted plan-intro">
            Course le {fmtDateLong(profile.race_date).toLowerCase()}, dans {Math.max(0, Math.ceil(daysUntil(profile.race_date) / 7))}{' '}
            semaines. {profile.sessions_per_week} séances par semaine, sans jour imposé.
          </p>
          <ul className="rules">
            {WEEK_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}

      {plan.length === 0 ? (
        <Empty
          action={
            <a className="btn btn-primary" href="#/coach">
              Demander le plan au coach
            </a>
          }
        >
          Pas encore de plan. Renseigne tes perfs et ton objectif dans Profil, puis demande-le au coach.
        </Empty>
      ) : (
        <>
          {past.length > 0 && (
            <button type="button" className="btn btn-text" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Masquer' : 'Afficher'} les semaines passées ({past.length})
            </button>
          )}
          {visible.map((w) => {
            const km = plannedKm(w.sessions)
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
