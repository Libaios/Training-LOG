import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/Layout'
import { Icon } from '../components/Icon'
import { recapOf } from '../lib/recap'
import { fmtRange, ISO_DAYS, parseClock, useCoach } from '../lib/coach'
import { goalGap, vdotOf, ZONES } from '../lib/pace'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { fmt1, fmtClock, fmtDate, fmtPace, parseDecimal, toInput, todayISO } from '../lib/format'
import type { Performance, RunnerProfile } from '../lib/types'

const DISTANCES = [
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: 'Semi', km: 21.0975 },
]

const KINDS: { value: Performance['kind']; label: string }[] = [
  { value: 'course', label: 'Course officielle' },
  { value: 'test', label: 'Test chronométré' },
  { value: 'entrainement', label: 'Sortie d’entraînement' },
]

function distanceLabel(km: number): string {
  const preset = DISTANCES.find((d) => Math.abs(d.km - km) < 0.01)
  return preset ? preset.label : `${toInput(Math.round(km * 100) / 100)} km`
}

function LevelCard() {
  const { vdot, paces, predictedRaceSec, profile } = useCoach()
  if (!vdot || !paces || !profile) {
    return (
      <section className="level-card">
        <h2>Tes allures</h2>
        <p className="muted">Note une course ou une sortie à fond (ressenti 8/10 ou plus, 3 km minimum) : tes allures se calculent toutes seules.</p>
      </section>
    )
  }
  const gap = goalGap(vdot, profile)
  return (
    <section className="level-card">
      <div className="level-figures">
        <div>
          <span className="muted">Semi prédit aujourd’hui</span>
          <strong>{predictedRaceSec ? fmtClock(predictedRaceSec) : '–'}</strong>
        </div>
        <div>
          <span className="muted">Objectif</span>
          <strong>{profile.goal_time_sec ? fmtClock(profile.goal_time_sec) : 'Non fixé'}</strong>
        </div>
      </div>
      {gap !== null && (
        <p className="level-gap">
          {gap > 0
            ? `Il faut gagner ${fmtClock(gap)} d’ici la course : objectif ambitieux mais c’est le rôle de la prépa.`
            : `Ton niveau actuel couvre déjà l’objectif avec ${fmtClock(-gap)} de marge.`}
          {gap > 600 ? ' Au-delà de 10 min, le coach risque de te proposer un objectif intermédiaire.' : ''}
        </p>
      )}
      <table className="zones">
        <caption className="visually-hidden">Allures d’entraînement par zone</caption>
        <tbody>
          {ZONES.map((z) => (
            <tr key={z.zone}>
              <th scope="row">
                <span className={`zone-dot zone-${z.zone}`} aria-hidden />
                {z.label}
                <span className="muted">{z.hint}</span>
              </th>
              <td>{fmtRange(paces[z.zone])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted chart-note">En min/km. Indice VDOT {fmt1(vdot)} (méthode Daniels), mis à jour automatiquement avec tes dernières courses et sorties à fond (90 derniers jours).</p>
    </section>
  )
}

function Recap() {
  const { runs } = useStore()
  const r = recapOf(runs)
  const last = runs[0]
  return (
    <section className="section">
      <div className="section-head">
        <h2>Tes 4 dernières semaines</h2>
        <a href="#/course">Historique</a>
      </div>
      {r.runs === 0 ? (
        <p className="muted">Aucune sortie sur les 4 dernières semaines. Dès que tu en notes une, ce récap se met à jour tout seul.</p>
      ) : (
        <div className="recap-grid">
          <div>
            <strong>{fmt1(r.km)}</strong>
            <span className="muted">km au total</span>
          </div>
          <div>
            <strong>{r.runs}</strong>
            <span className="muted">{r.runs > 1 ? 'sorties' : 'sortie'}</span>
          </div>
          <div>
            <strong>{fmt1(r.weeklyKm)}</strong>
            <span className="muted">km par semaine</span>
          </div>
          <div>
            <strong>{fmt1(r.longestKm)}</strong>
            <span className="muted">km, la plus longue</span>
          </div>
          <div>
            <strong>{r.avgPace ? fmtPace(r.avgPace) : '–'}</strong>
            <span className="muted">/km en moyenne</span>
          </div>
          <div>
            <strong>{last ? fmtDate(last.performed_on) : '–'}</strong>
            <span className="muted">dernière sortie</span>
          </div>
        </div>
      )}
    </section>
  )
}

function Performances() {
  const { performances, addPerformance, deletePerformance } = useStore()
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [km, setKm] = useState<number | null>(10)
  const [other, setOther] = useState('')
  const [time, setTime] = useState('')
  const [kind, setKind] = useState<Performance['kind']>('course')
  const [error, setError] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    const distance = km ?? parseDecimal(other)
    const sec = parseClock(time)
    if (!distance || distance <= 0) return setError('Indique la distance.')
    if (!sec) return setError('Temps invalide : écris par exemple 52:30 ou 1:54:10.')
    const pace = sec / distance
    if (pace < 150 || pace > 900) return setError('Ce temps donne une allure improbable, vérifie la saisie.')
    setError(null)
    try {
      await addPerformance({ performed_on: date, distance_km: distance, time_sec: sec, kind, notes: null })
      setTime('')
      toast('Perf ajoutée, allures mises à jour')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="section">
      <p className="muted">Facultatif : tes sorties comptent déjà. Utile pour une course faite ailleurs.</p>
      {performances.length > 0 && (
        <ul className="list compact">
          {performances.map((p) => (
            <li key={p.id}>
              <div className="list-row">
                <span className="row-main">
                  <span className="row-title">
                    {distanceLabel(p.distance_km)} en {fmtClock(p.time_sec)}
                  </span>
                  <span className="row-sub">
                    {fmtDate(p.performed_on)}, {fmtPace(p.time_sec / p.distance_km)} /km, VDOT {fmt1(vdotOf(p.distance_km, p.time_sec))}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Supprimer la perf"
                  onClick={() => window.confirm('Supprimer cette perf ?') && void deletePerformance(p.id)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="perf-form" onSubmit={add}>
        <div className="chips">
          {DISTANCES.map((d) => (
            <button key={d.label} type="button" className="chip" aria-pressed={km === d.km} onClick={() => setKm(d.km)}>
              {d.label}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={km === null} onClick={() => setKm(null)}>
            Autre
          </button>
        </div>
        {km === null && (
          <label className="field">
            <span>Distance (km)</span>
            <input inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
        )}
        <div className="form-grid even">
          <label className="field">
            <span>Temps</span>
            <input inputMode="numeric" placeholder="52:30 ou 1:54:10" value={time} onChange={(e) => setTime(e.target.value.replace(/[^\d:]/g, ''))} />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Contexte</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Performance['kind'])}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-outline">
          <Icon name="plus" size={18} />
          Ajouter la perf
        </button>
      </form>
    </section>
  )
}

type ProfileForm = {
  raceName: string
  raceDate: string
  goal: string
  sessions: number
  days: number[]
  longDay: number
  weeklyKm: string
  longest: string
  constraints: string
}

const formFrom = (p: RunnerProfile): ProfileForm => ({
  raceName: p.race_name,
  raceDate: p.race_date,
  goal: p.goal_time_sec ? fmtClock(p.goal_time_sec) : '',
  sessions: p.sessions_per_week,
  days: [...p.available_days].sort(),
  longDay: p.long_run_day,
  weeklyKm: p.current_weekly_km === null ? '' : toInput(p.current_weekly_km),
  longest: p.longest_recent_run_km === null ? '' : toInput(p.longest_recent_run_km),
  constraints: p.constraints ?? '',
})

function GoalAndAvailability({ profile }: { profile: RunnerProfile }) {
  const { saveProfile } = useStore()
  const toast = useToast()
  const [form, setForm] = useState<ProfileForm>(() => formFrom(profile))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm(formFrom(profile)), [profile])
  const update = (patch: Partial<ProfileForm>) => setForm((f) => ({ ...f, ...patch }))

  async function save(e: FormEvent) {
    e.preventDefault()
    const goal = form.goal.trim() ? parseClock(form.goal) : null
    if (form.goal.trim() && !goal) return setError('Objectif invalide : écris par exemple 1:55:00.')
    if (!form.days.length) return setError('Choisis au moins un jour disponible.')
    if (form.days.length < form.sessions) return setError('Il faut au moins autant de jours disponibles que de séances par semaine.')
    setError(null)
    setBusy(true)
    try {
      await saveProfile({
        race_name: form.raceName.trim() || profile.race_name,
        race_date: form.raceDate,
        goal_time_sec: goal,
        sessions_per_week: form.sessions,
        available_days: form.days,
        long_run_day: form.longDay,
        current_weekly_km: parseDecimal(form.weeklyKm),
        longest_recent_run_km: parseDecimal(form.longest),
        constraints: form.constraints.trim() || null,
      })
      toast('Profil enregistré, le coach en tiendra compte')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleDay = (d: number) =>
    update({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort() })

  return (
    <form className="section profile-form" onSubmit={save}>
      <h2>Objectif</h2>
      <label className="field">
        <span>Course</span>
        <input type="text" value={form.raceName} onChange={(e) => update({ raceName: e.target.value })} />
      </label>
      <div className="form-grid even">
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.raceDate} onChange={(e) => update({ raceDate: e.target.value })} />
        </label>
        <label className="field">
          <span>Temps visé</span>
          <input inputMode="numeric" placeholder="1:55:00" value={form.goal} onChange={(e) => update({ goal: e.target.value.replace(/[^\d:]/g, '') })} />
        </label>
      </div>

      <h2>Disponibilités</h2>
      <label className="field">
        <span>Séances de course par semaine</span>
        <div className="chips">
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={form.sessions === n} onClick={() => update({ sessions: n })}>
              {n}
            </button>
          ))}
        </div>
      </label>
      <fieldset className="field">
        <legend>Jours où tu peux courir</legend>
        <div className="day-picker">
          {ISO_DAYS.map((d) => (
            <button key={d.value} type="button" aria-pressed={form.days.includes(d.value)} aria-label={d.label} onClick={() => toggleDay(d.value)}>
              {d.short}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>Jour de la sortie longue</span>
        <select value={form.longDay} onChange={(e) => update({ longDay: Number(e.target.value) })}>
          {ISO_DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <h2>Où tu en es</h2>
      <div className="form-grid even">
        <label className="field">
          <span>Km par semaine en ce moment</span>
          <input inputMode="decimal" placeholder="Ex. 20" value={form.weeklyKm} onChange={(e) => update({ weeklyKm: e.target.value.replace(/[^\d.,]/g, '') })} />
        </label>
        <label className="field">
          <span>Plus longue sortie récente (km)</span>
          <input inputMode="decimal" placeholder="Ex. 12" value={form.longest} onChange={(e) => update({ longest: e.target.value.replace(/[^\d.,]/g, '') })} />
        </label>
      </div>
      <label className="field">
        <span>À savoir pour le coach</span>
        <textarea
          rows={3}
          placeholder="Blessures passées, semaines chargées, vacances, autres sports…"
          value={form.constraints}
          onChange={(e) => update({ constraints: e.target.value })}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer le profil'}
      </button>
    </form>
  )
}

export function Profile() {
  const { profile } = useStore()
  return (
    <main className="screen">
      <PageHeader title="Profil" />
      <Recap />
      <LevelCard />
      <details className="fold">
        <summary>Perfs saisies à la main</summary>
        <Performances />
      </details>
      {profile && (
        <details className="fold">
          <summary>Objectif et disponibilités</summary>
          <GoalAndAvailability profile={profile} />
        </details>
      )}
      <a className="btn btn-text" href="#/reglages">
        Exports et réglages
      </a>
    </main>
  )
}
