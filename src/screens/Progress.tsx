import { useMemo, useState } from 'react'
import { Empty, PageHeader } from '../components/Layout'
import { TrendLine, WeeklyBars } from '../components/Charts'
import { useStore } from '../lib/store'
import { bestSet, e1rm, exerciseHistory, lastWeeks, runRecords, weeklyKm, weeklyVolume } from '../lib/stats'
import {
  fmt1,
  fmtClock,
  fmtDate,
  fmtDateShort,
  fmtInt,
  fmtKm,
  fmtPace,
  paceOf,
  toInput,
  todayISO,
} from '../lib/format'
import { RUN_TYPES, runTypeLabel, type RunType } from '../lib/types'

type Tab = 'muscu' | 'course'

export function Progress() {
  const [tab, setTab] = useState<Tab>('muscu')
  return (
    <main className="screen">
      <PageHeader title="Progrès" />
      <div className="segmented" role="tablist" aria-label="Discipline">
        <button type="button" role="tab" aria-selected={tab === 'muscu'} onClick={() => setTab('muscu')}>
          Muscu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'course'}
          className="seg-run"
          onClick={() => setTab('course')}
        >
          Course
        </button>
      </div>
      {tab === 'muscu' ? <StrengthProgress /> : <RunProgress />}
    </main>
  )
}

function StrengthProgress() {
  const { workouts, exercises } = useStore()

  // Exercices pratiqués, du plus fréquent au moins fréquent.
  const practiced = useMemo(() => {
    const count = new Map<string, number>()
    for (const w of workouts) {
      for (const id of new Set(w.sets.map((s) => s.exercise_id))) count.set(id, (count.get(id) ?? 0) + 1)
    }
    return exercises
      .filter((e) => count.has(e.id))
      .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'fr'))
  }, [workouts, exercises])

  const [selected, setSelected] = useState<string>('')
  const exerciseId = selected || practiced[0]?.id || ''
  const history = useMemo(() => (exerciseId ? exerciseHistory(workouts, exerciseId) : []), [workouts, exerciseId])

  const weeks = lastWeeks(12)
  const volume = weeklyVolume(workouts, weeks).map((d) => ({ label: fmtDateShort(d.week), value: d.value }))

  if (!practiced.length) {
    return <Empty>Les courbes apparaîtront dès la première séance enregistrée.</Empty>
  }

  const best = bestSet(history.flatMap((h) => h.sets))
  const maxWeight = Math.max(...history.map((h) => h.maxWeight))
  const bestE1rm = Math.max(...history.map((h) => h.bestE1rm))
  const points = history.slice(-20).map((h) => {
    const top = bestSet(h.sets)
    return {
      label: fmtDateShort(h.date),
      value: Math.round(h.bestE1rm * 10) / 10,
      detail: top ? `Meilleure série : ${top.reps} × ${toInput(top.weight_kg)} kg` : undefined,
    }
  })

  return (
    <>
      <label className="field">
        <span>Exercice</span>
        <select value={exerciseId} onChange={(e) => setSelected(e.target.value)}>
          {practiced.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      <dl className="records">
        <div>
          <dt>1RM estimé</dt>
          <dd>{toInput(Math.round(bestE1rm * 2) / 2)} kg</dd>
        </div>
        <div>
          <dt>Charge max</dt>
          <dd>{toInput(maxWeight)} kg</dd>
        </div>
        <div>
          <dt>Meilleure série</dt>
          <dd>{best ? `${best.reps} × ${toInput(best.weight_kg)} kg` : '–'}</dd>
        </div>
      </dl>

      <section className="section">
        <div className="section-head">
          <h2>1RM estimé par séance</h2>
          <span className="muted">{history.length > 20 ? '20 dernières séances' : `${history.length} séance${history.length > 1 ? 's' : ''}`}</span>
        </div>
        {points.length < 2 ? (
          <p className="muted chart-note">Il faut au moins deux séances sur cet exercice pour tracer une courbe.</p>
        ) : (
          <TrendLine
            data={points}
            tone="strength"
            format={(v) => `${fmtInt(v)} kg`}
            summary="Évolution du 1RM estimé"
          />
        )}
        <p className="chart-note muted">Estimation à partir de la meilleure série de chaque séance (formule d’Epley).</p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Tonnage par semaine</h2>
          <span className="muted">12 semaines</span>
        </div>
        <WeeklyBars
          data={volume}
          tone="strength"
          format={(v) => (v >= 1000 ? `${fmt1(v / 1000)} t` : `${fmtInt(v)} kg`)}
          summary="Tonnage soulevé par semaine, tous exercices"
        />
        <p className="chart-note muted">Répétitions × charge, tous exercices confondus.</p>
      </section>

      <section className="section">
        <h2>Historique</h2>
        <ul className="list compact">
          {[...history].reverse().slice(0, 8).map((h) => (
            <li key={h.workoutId}>
              <a className="list-row" href={`#/muscu/${h.workoutId}`}>
                <span className="row-main">
                  <span className="row-title">{fmtDate(h.date)}</span>
                  <span className="row-sub">{h.sets.map((s) => `${s.reps}×${toInput(s.weight_kg)}`).join(', ')} kg</span>
                </span>
                <span className="row-end">{toInput(Math.round(Math.max(...h.sets.map((s) => e1rm(s.weight_kg, s.reps))) * 2) / 2)} kg</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function RunProgress() {
  const { runs } = useStore()
  const [type, setType] = useState<RunType | ''>('')

  if (!runs.length) {
    return <Empty>Les courbes apparaîtront dès la première sortie enregistrée.</Empty>
  }

  const weeks = lastWeeks(12)
  const km = weeklyKm(runs, weeks).map((d) => ({ label: fmtDateShort(d.week), value: d.value }))
  const filtered = runs.filter((r) => !type || r.run_type === type)
  const pacePoints = [...filtered]
    .sort((a, b) => a.performed_on.localeCompare(b.performed_on))
    .slice(-25)
    .map((r) => ({
      label: fmtDateShort(r.performed_on),
      value: Math.round(paceOf(r.distance_km, r.duration_sec)),
      detail: `${fmtKm(r.distance_km)} en ${fmtClock(r.duration_sec)}, ${runTypeLabel(r.run_type).toLowerCase()}`,
    }))

  // Graduations de l'allure par pas ronds (15 s, 30 s ou 1 min).
  const paces = pacePoints.map((p) => p.value)
  const span = paces.length ? Math.max(...paces) - Math.min(...paces) : 0
  const step = span > 240 ? 60 : span > 100 ? 30 : 15
  const lo = paces.length ? Math.floor(Math.min(...paces) / step) * step : 0
  const hi = paces.length ? Math.ceil(Math.max(...paces) / step) * step : 0
  const paceTicks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)

  const { longest, fastest5, fastest10 } = runRecords(runs)
  const year = todayISO().slice(0, 4)
  const yearKm = runs.filter((r) => r.performed_on.startsWith(year)).reduce((s, r) => s + r.distance_km, 0)

  return (
    <>
      <dl className="records records-run">
        <div>
          <dt>Total {year}</dt>
          <dd>{fmt1(yearKm)} km</dd>
        </div>
        <div>
          <dt>Plus longue sortie</dt>
          <dd>{longest ? fmtKm(longest.distance_km) : '–'}</dd>
        </div>
        <div>
          <dt>Meilleure allure, 5 km et plus</dt>
          <dd>{fastest5 ? `${fmtPace(paceOf(fastest5.distance_km, fastest5.duration_sec))} /km` : '–'}</dd>
        </div>
        <div>
          <dt>Meilleure allure, 10 km et plus</dt>
          <dd>{fastest10 ? `${fmtPace(paceOf(fastest10.distance_km, fastest10.duration_sec))} /km` : '–'}</dd>
        </div>
      </dl>

      <section className="section">
        <div className="section-head">
          <h2>Kilomètres par semaine</h2>
          <span className="muted">12 semaines</span>
        </div>
        <WeeklyBars data={km} tone="run" format={(v) => `${fmt1(v)} km`} summary="Kilomètres courus par semaine" />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Allure des sorties</h2>
          <select
            className="select-inline"
            value={type}
            onChange={(e) => setType(e.target.value as RunType | '')}
            aria-label="Type de sortie"
          >
            <option value="">Toutes</option>
            {RUN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {pacePoints.length < 2 ? (
          <p className="muted chart-note">Il faut au moins deux sorties de ce type pour tracer une courbe.</p>
        ) : (
          <TrendLine
            data={pacePoints}
            tone="run"
            reversed
            ticks={paceTicks.length > 1 ? paceTicks : undefined}
            format={(v) => fmtPace(v)}
            summary="Allure des sorties en minutes par kilomètre"
          />
        )}
        <p className="chart-note muted">En minutes par km. Plus le point est haut, plus la sortie était rapide.</p>
      </section>
    </>
  )
}
