import { addDays, fmtWeekday, fromISODate, todayISO } from '../lib/format'

type DayActivity = { strength: number; run: number }

/** Les 7 jours de la semaine : un pavé bleu par séance muscu, un jaune par sortie. */
export function WeekStrip({ monday, activity }: { monday: string; activity: Map<string, DayActivity> }) {
  const today = todayISO()
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return (
    <ol className="week-strip" aria-label="Activité de la semaine">
      {days.map((d) => {
        const a = activity.get(d) ?? { strength: 0, run: 0 }
        const parts = [
          a.strength ? `${a.strength} séance${a.strength > 1 ? 's' : ''} muscu` : '',
          a.run ? `${a.run} sortie${a.run > 1 ? 's' : ''} course` : '',
        ].filter(Boolean)
        return (
          <li
            key={d}
            className={`day${d === today ? ' is-today' : ''}${d > today ? ' is-future' : ''}`}
            aria-label={`${fmtWeekday(d)} ${fromISODate(d).getDate()} : ${parts.join(', ') || 'repos'}`}
          >
            <span className="day-name">{fmtWeekday(d).charAt(0).toUpperCase()}</span>
            <span className="day-num">{fromISODate(d).getDate()}</span>
            <span className="day-blocks" aria-hidden>
              {Array.from({ length: a.strength }, (_, i) => (
                <span key={`s${i}`} className="block block-strength" />
              ))}
              {Array.from({ length: a.run }, (_, i) => (
                <span key={`r${i}`} className="block block-run" />
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
