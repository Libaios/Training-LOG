import { Empty, PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { useStore } from '../lib/store'
import { exerciseCount, setsVolume } from '../lib/stats'
import { fmtInt, fmtMonth, fmtWeekday, fromISODate, plural } from '../lib/format'
import type { Workout } from '../lib/types'

export function WorkoutList() {
  const { workouts, exerciseById } = useStore()

  const byMonth = new Map<string, Workout[]>()
  for (const w of workouts) {
    const key = w.performed_on.slice(0, 7)
    byMonth.set(key, [...(byMonth.get(key) ?? []), w])
  }

  return (
    <main className="screen">
      <PageHeader
        title="Muscu"
        action={
          <a className="btn btn-primary btn-small" href="#/muscu/nouvelle">
            <Icon name="plus" size={18} />
            Nouvelle séance
          </a>
        }
      />
      {workouts.length === 0 ? (
        <Empty
          action={
            <a className="btn btn-primary" href="#/muscu/nouvelle">
              Ajouter une séance
            </a>
          }
        >
          Aucune séance de muscu pour l’instant.
        </Empty>
      ) : (
        Array.from(byMonth.entries()).map(([month, list]) => (
          <section key={month} className="section">
            <h2>{fmtMonth(`${month}-01`)}</h2>
            <ul className="list">
              {list.map((w) => {
                const names = Array.from(new Set(w.sets.map((s) => s.exercise_id)))
                  .map((id) => exerciseById.get(id)?.name)
                  .filter(Boolean)
                return (
                  <li key={w.id}>
                    <a className="list-row" href={`#/muscu/${w.id}`}>
                      <span className="date-chip date-chip-strength">
                        <span>{fmtWeekday(w.performed_on)}</span>
                        <strong>{fromISODate(w.performed_on).getDate()}</strong>
                      </span>
                      <span className="row-main">
                        <span className="row-title">{w.title || 'Séance muscu'}</span>
                        <span className="row-sub">
                          {plural(exerciseCount(w), 'exercice')}, {plural(w.sets.length, 'série')},{' '}
                          {fmtInt(Math.round(setsVolume(w.sets)))} kg
                        </span>
                        {names.length > 0 && <span className="row-sub row-clip">{names.join(', ')}</span>}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
