import { WeeklyBars } from './Charts'
import { useStore } from '../lib/store'
import { lastWeeks, weeklyKm } from '../lib/stats'
import { fmt1, fmtDateShort } from '../lib/format'

/** Kilomètres courus par semaine sur les 12 dernières semaines. */
export default function RunsChart() {
  const { runs } = useStore()
  const data = weeklyKm(runs, lastWeeks(12)).map((d) => ({ label: fmtDateShort(d.week), value: d.value }))
  return <WeeklyBars data={data} tone="run" format={(v) => `${fmt1(v)} km`} summary="Kilomètres courus par semaine" />
}
