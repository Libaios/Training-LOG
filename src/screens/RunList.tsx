import { lazy, Suspense } from 'react'
import { Empty, PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { useStore } from '../lib/store'
import { fmt1, fmtClock, fmtKm, fmtMonth, fmtPace, fmtWeekday, fromISODate, paceOf, plural } from '../lib/format'
import { runTypeLabel, type Run } from '../lib/types'

const RunsChart = lazy(() => import('../components/RunsChart'))

export function RunList() {
  const { runs, sessionById } = useStore()

  const byMonth = new Map<string, Run[]>()
  for (const r of runs) {
    const key = r.performed_on.slice(0, 7)
    byMonth.set(key, [...(byMonth.get(key) ?? []), r])
  }

  return (
    <main className="screen">
      <PageHeader
        title="Courses"
        action={
          <a className="btn btn-run btn-small" href="#/course/nouvelle">
            <Icon name="plus" size={18} />
            Noter une sortie
          </a>
        }
      />
      {runs.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Km par semaine</h2>
            <span className="muted">12 semaines</span>
          </div>
          <Suspense fallback={<div className="chart chart-placeholder" />}>
            <RunsChart />
          </Suspense>
        </section>
      )}
      {runs.length === 0 ? (
        <Empty
          action={
            <a className="btn btn-run" href="#/course/nouvelle">
              Ajouter une sortie
            </a>
          }
        >
          Aucune sortie pour l’instant.
        </Empty>
      ) : (
        Array.from(byMonth.entries()).map(([month, list]) => {
          const km = list.reduce((s, r) => s + r.distance_km, 0)
          return (
            <section key={month} className="section">
              <div className="section-head">
                <h2>{fmtMonth(`${month}-01`)}</h2>
                <span className="muted">
                  {plural(list.length, 'sortie')}, {fmt1(km)} km
                </span>
              </div>
              <ul className="list">
                {list.map((r) => (
                  <li key={r.id}>
                    <a className="list-row" href={`#/course/${r.id}`}>
                      <span className="date-chip date-chip-run">
                        <span>{fmtWeekday(r.performed_on)}</span>
                        <strong>{fromISODate(r.performed_on).getDate()}</strong>
                      </span>
                      <span className="row-main">
                        <span className="row-title">
                          {fmtKm(r.distance_km)} <span className="tag">{runTypeLabel(r.run_type)}</span>
                          {r.planned_session_id && sessionById.get(r.planned_session_id) && (
                            <span className="tag tag-plan">Plan</span>
                          )}
                        </span>
                        <span className="row-sub">
                          {fmtClock(r.duration_sec)}, {fmtPace(paceOf(r.distance_km, r.duration_sec))} /km
                          {r.avg_hr ? `, ${r.avg_hr} bpm` : ''}
                          {r.rpe ? `, ressenti ${r.rpe}/10` : ''}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </main>
  )
}
