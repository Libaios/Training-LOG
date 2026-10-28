import { useMemo } from 'react'
import { WeekStrip } from '../components/WeekStrip'
import { Empty } from '../components/Layout'
import { Icon } from '../components/Icon'
import { useStore } from '../lib/store'
import { activityByDay, exerciseCount, setsVolume } from '../lib/stats'
import {
  addDays,
  fmt1,
  fmtClock,
  fmtDate,
  fmtDateShort,
  fmtInt,
  fmtKm,
  fmtPace,
  paceOf,
  plural,
  todayISO,
  weekStart,
} from '../lib/format'
import { runTypeLabel, type WorkoutDraft } from '../lib/types'
import { readLocal, WORKOUT_DRAFT_KEY } from '../lib/ui'

export function Home() {
  const { workouts, runs } = useStore()
  const monday = weekStart(todayISO())
  const prevMonday = addDays(monday, -7)
  const activity = useMemo(() => activityByDay(workouts, runs), [workouts, runs])
  const draft = readLocal<WorkoutDraft>(WORKOUT_DRAFT_KEY)

  const inWeek = (date: string, start: string) => date >= start && date < addDays(start, 7)
  const weekWorkouts = workouts.filter((w) => inWeek(w.performed_on, monday))
  const weekRuns = runs.filter((r) => inWeek(r.performed_on, monday))
  const weekKm = weekRuns.reduce((s, r) => s + r.distance_km, 0)
  const prevKm = runs.filter((r) => inWeek(r.performed_on, prevMonday)).reduce((s, r) => s + r.distance_km, 0)
  const prevSessions = workouts.filter((w) => inWeek(w.performed_on, prevMonday)).length

  const recent = [
    ...workouts.map((w) => ({ kind: 'strength' as const, date: w.performed_on, created: w.created_at, w })),
    ...runs.map((r) => ({ kind: 'run' as const, date: r.performed_on, created: r.created_at, r })),
  ]
    .sort((a, b) => (a.date === b.date ? b.created.localeCompare(a.created) : b.date.localeCompare(a.date)))
    .slice(0, 6)

  const diff = (n: number, unit: (v: number) => string) =>
    n === 0 ? 'comme la semaine dernière' : `${n > 0 ? '+' : '−'}${unit(Math.abs(n))} vs semaine dernière`

  return (
    <main className="screen">
      <header className="home-head">
        <p className="muted">Semaine du {fmtDateShort(monday)}</p>
        <h1>Cette semaine</h1>
      </header>

      <WeekStrip monday={monday} activity={activity} />

      <dl className="week-figures">
        <div className="figure figure-strength">
          <dt>Muscu</dt>
          <dd>
            <span className="figure-value">{fmtInt(weekWorkouts.length)}</span>
            <span className="figure-unit">séance{weekWorkouts.length > 1 ? 's' : ''}</span>
          </dd>
          <dd className="figure-diff">{diff(weekWorkouts.length - prevSessions, (v) => plural(v, 'séance'))}</dd>
        </div>
        <div className="figure figure-run">
          <dt>Course</dt>
          <dd>
            <span className="figure-value">{fmt1(weekKm)}</span>
            <span className="figure-unit">km</span>
          </dd>
          <dd className="figure-diff">{diff(Math.round((weekKm - prevKm) * 10) / 10, (v) => `${fmt1(v)} km`)}</dd>
        </div>
      </dl>

      {draft && (
        <a className="draft-banner" href="#/muscu/nouvelle">
          <span>
            <strong>Séance en cours</strong>
            <span className="muted"> du {fmtDate(draft.performedOn)}, pas encore enregistrée</span>
          </span>
          <span className="draft-cta">Reprendre</span>
        </a>
      )}

      <div className="quick-actions">
        <a className="quick quick-strength" href="#/muscu/nouvelle">
          <Icon name="plus" />
          <span>Séance muscu</span>
        </a>
        <a className="quick quick-run" href="#/course/nouvelle">
          <Icon name="plus" />
          <span>Sortie course</span>
        </a>
      </div>

      <section className="section">
        <h2>Dernières activités</h2>
        {recent.length === 0 ? (
          <Empty>Rien de noté pour l’instant. Ajoute une séance ou une sortie pour commencer.</Empty>
        ) : (
          <ul className="list">
            {recent.map((item) =>
              item.kind === 'strength' ? (
                <li key={item.w.id}>
                  <a className="list-row" href={`#/muscu/${item.w.id}`}>
                    <span className="row-mark mark-strength" aria-hidden />
                    <span className="row-main">
                      <span className="row-title">{item.w.title || 'Séance muscu'}</span>
                      <span className="row-sub">
                        {fmtDate(item.date)}, {plural(exerciseCount(item.w), 'exercice')},{' '}
                        {fmtInt(Math.round(setsVolume(item.w.sets)))} kg soulevés
                      </span>
                    </span>
                  </a>
                </li>
              ) : (
                <li key={item.r.id}>
                  <a className="list-row" href={`#/course/${item.r.id}`}>
                    <span className="row-mark mark-run" aria-hidden />
                    <span className="row-main">
                      <span className="row-title">
                        {fmtKm(item.r.distance_km)} {runTypeLabel(item.r.run_type).toLowerCase()}
                      </span>
                      <span className="row-sub">
                        {fmtDate(item.date)}, {fmtClock(item.r.duration_sec)}, {fmtPace(paceOf(item.r.distance_km, item.r.duration_sec))} /km
                      </span>
                    </span>
                  </a>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  )
}
