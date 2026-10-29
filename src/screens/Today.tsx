import { useState } from 'react'
import { Icon } from '../components/Icon'
import { SessionRow, SessionSteps, SessionTag } from '../components/Session'
import { daysUntil, plannedKm, runsKmBetween, sessionTarget, useCoach } from '../lib/coach'
import { useStore } from '../lib/store'
import { addDays, fmt1, fmtClock, fmtDate, fmtDateLong, fmtPace, fmtWeekday, fromISODate, paceOf, todayISO, weekStart } from '../lib/format'
import { phaseLabel, runTypeLabel, sessionTone, type PlanSession, type Run } from '../lib/types'
import { recapOf } from '../lib/recap'
import { useToast } from '../lib/ui'
import { errorMessage } from '../lib/supabase'

/** Les 7 jours de la semaine : un pavé par séance (plein = faite), gris pour les sorties hors plan. */
function PlanWeek({ monday, sessions, runs }: { monday: string; sessions: PlanSession[]; runs: Run[] }) {
  const today = todayISO()
  return (
    <ol className="week-strip" aria-label="Semaine en cours">
      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
        const day = sessions.filter((s) => s.scheduled_on === d)
        const extra = runs.filter((r) => r.performed_on === d && !r.planned_session_id)
        const label = [
          ...day.map((s) => `${s.title} (${s.status === 'faite' ? 'faite' : s.status === 'sautee' ? 'sautée' : 'prévue'})`),
          ...extra.map(() => 'sortie hors plan'),
        ].join(', ')
        return (
          <li
            key={d}
            className={`day${d === today ? ' is-today' : ''}${d > today ? ' is-future' : ''}`}
            aria-label={`${fmtWeekday(d)} ${fromISODate(d).getDate()} : ${label || 'repos'}`}
          >
            <span className="day-name">{fmtWeekday(d).charAt(0).toUpperCase()}</span>
            <span className="day-num">{fromISODate(d).getDate()}</span>
            <span className="day-blocks" aria-hidden>
              {day.map((s) => (
                <span key={s.id} className={`block tone-${sessionTone(s.session_type)} block-${s.status}`} />
              ))}
              {extra.map((r) => (
                <span key={r.id} className="block block-extra" />
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function SessionCard({ session }: { session: PlanSession }) {
  const { setSessionStatus, runs } = useStore()
  const toast = useToast()
  const run = session.run_id ? runs.find((r) => r.id === session.run_id) : undefined
  const target = sessionTarget(session)

  async function skip() {
    if (!window.confirm('Marquer cette séance comme sautée ? Le coach en tiendra compte ce soir.')) return
    try {
      await setSessionStatus(session.id, 'sautee')
      toast('Séance marquée sautée')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <article className={`today-card tone-${sessionTone(session.session_type)}`}>
      <div className="today-card-head">
        <SessionTag session={session} />
        {session.phase && <span className="muted">{phaseLabel(session.phase)}</span>}
      </div>
      <h2>{session.title}</h2>
      {target && <p className="today-target">{target}</p>}
      {session.description && <p>{session.description}</p>}
      <SessionSteps steps={session.structure} />
      {session.coach_comment && <p className="coach-quote">{session.coach_comment}</p>}

      {session.status === 'faite' && run ? (
        <a className="done-line" href={`#/course/${run.id}`}>
          <Icon name="check" size={18} />
          <span>
            Faite : {fmt1(run.distance_km)} km en {fmtClock(run.duration_sec)}, {fmtPace(paceOf(run.distance_km, run.duration_sec))} /km
          </span>
        </a>
      ) : session.status === 'sautee' ? (
        <div className="done-line is-skipped">
          <span>Séance sautée</span>
          <button type="button" className="btn btn-text btn-small" onClick={() => setSessionStatus(session.id, 'prevue')}>
            Annuler
          </button>
        </div>
      ) : (
        <div className="today-actions">
          <a className="btn btn-primary" href={`#/course/nouvelle/${session.id}`}>
            <Icon name="check" size={18} />
            Je l’ai faite
          </a>
          <a className="btn btn-outline" href={`#/seance/${session.id}`}>
            Modifier ou déplacer
          </a>
          <button type="button" className="btn btn-text" onClick={skip}>
            Sauter
          </button>
        </div>
      )}
    </article>
  )
}

const firstLines = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')}…` : flat
}

export function Today() {
  const { profile, plan, runs, coachNotes, coachRequests, performances } = useStore()
  const { vdot } = useCoach()
  const today = todayISO()
  const [offset, setOffset] = useState(0)
  const thisMonday = weekStart(today)
  const monday = addDays(thisMonday, offset * 7)
  const weekSessions = plan.filter((s) => s.scheduled_on >= monday && s.scheduled_on < addDays(monday, 7))
  const todaySessions = plan.filter((s) => s.scheduled_on === today)
  const next = plan.find((s) => s.scheduled_on > today && s.status === 'prevue')
  const unread = coachNotes.filter((n) => !n.read)
  const pending = coachRequests.filter((r) => r.status === 'en_attente')
  const raceIn = profile ? daysUntil(profile.race_date) : null
  const current = todaySessions[0] ?? plan.find((s) => s.scheduled_on >= today)
  const phase = current?.phase ?? null
  const weekNumber = current?.week_number ?? null
  const doneKm = runsKmBetween(runs, monday, addDays(monday, 7))
  const futurePlan = plan.some((s) => s.scheduled_on >= today)
  const advice = coachNotes.filter((n) => n.kind !== 'plan').slice(0, 2)
  const recap = recapOf(runs)
  const lastRuns = runs.slice(0, 3)

  return (
    <main className="screen">
      <header className="today-head">
        {profile && (
          <p className="muted">
            {profile.race_name}, {fmtDateLong(profile.race_date).toLowerCase()}
          </p>
        )}
        <h1>
          {raceIn !== null && raceIn >= 0 ? (
            <>
              J-{raceIn} <span className="h1-light">avant la course</span>
            </>
          ) : (
            'Aujourd’hui'
          )}
        </h1>
        {(weekNumber || phase) && (
          <p className="muted">
            {weekNumber ? `Semaine ${weekNumber}` : ''}
            {weekNumber && phase ? ', ' : ''}
            {phase ? `phase ${phaseLabel(phase).toLowerCase()}` : ''}
          </p>
        )}
      </header>

      {unread.length > 0 && (
        <a className="coach-banner" href="#/coach">
          <Icon name="message" size={20} />
          <span>
            <strong>{unread[0].title}</strong>
            <span className="muted">{unread.length > 1 ? ` et ${unread.length - 1} autre${unread.length > 2 ? 's' : ''} message${unread.length > 2 ? 's' : ''}` : ''}</span>
          </span>
        </a>
      )}

      {!futurePlan && (
        <section className="onboarding">
          <h2>Préparer ton plan</h2>
          <ol>
            <li className={performances.length ? 'is-done' : ''}>
              <a href="#/profil">Renseigne au moins une perf récente</a> (course ou sortie chronométrée) : tes allures en découlent.
            </li>
            <li className={profile?.goal_time_sec ? 'is-done' : ''}>
              <a href="#/profil">Indique ton objectif de temps et tes jours dispo.</a>
            </li>
            <li className={pending.length ? 'is-done' : ''}>
              <a href="#/coach">Demande ton plan au coach.</a> Il le construit ce soir, ou tout de suite si tu lui écris dans Claude.
            </li>
          </ol>
          {vdot === null && <p className="muted">Sans perf, le coach ne peut pas calculer tes allures.</p>}
        </section>
      )}

      {futurePlan && (
        <section className="section">
          <h2 className="visually-hidden">Séance du jour</h2>
          {todaySessions.length > 0 ? (
            todaySessions.map((s) => <SessionCard key={s.id} session={s} />)
          ) : (
            <div className="rest-card">
              <p>
                <strong>Repos aujourd’hui.</strong>
              </p>
              {next && (
                <p className="muted">
                  Prochaine séance {fmtDate(next.scheduled_on)} : {next.title}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {futurePlan && (
        <section className="section">
          <div className="section-head">
            <h2>{offset === 0 ? 'Cette semaine' : `Semaine du ${fmtDate(monday)}`}</h2>
            <span className="muted">
              {fmt1(doneKm)} / {fmt1(plannedKm(weekSessions))} km
            </span>
          </div>
          <div className="week-nav">
            <button type="button" className="btn btn-outline btn-small" onClick={() => setOffset(offset - 1)}>
              ‹ Semaine précédente
            </button>
            {offset !== 0 && (
              <button type="button" className="btn btn-text btn-small" onClick={() => setOffset(0)}>
                Aujourd’hui
              </button>
            )}
            <button type="button" className="btn btn-outline btn-small" onClick={() => setOffset(offset + 1)}>
              Suivante ›
            </button>
          </div>
          <PlanWeek monday={monday} sessions={weekSessions} runs={runs} />
          <ul className="list compact">
            {[
              ...weekSessions.map((s) => ({ date: s.scheduled_on, session: s, run: undefined })),
              ...runs
                .filter((r) => r.performed_on >= monday && r.performed_on < addDays(monday, 7) && !r.planned_session_id)
                .map((r) => ({ date: r.performed_on, session: undefined, run: r })),
            ]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(({ session: s, run: r }) =>
                s ? (
                  <li key={s.id}>
                    <SessionRow session={s} />
                  </li>
                ) : r ? (
                  <li key={r.id}>
                    <a className="list-row" href={`#/course/${r.id}`}>
                      <span className="date-chip tone-extra">
                        <span>{fmtWeekday(r.performed_on)}</span>
                        <strong>{fromISODate(r.performed_on).getDate()}</strong>
                      </span>
                      <span className="row-main">
                        <span className="row-title">Hors plan : {runTypeLabel(r.run_type).toLowerCase()}</span>
                        <span className="row-sub">
                          {fmt1(r.distance_km)} km, {fmtPace(paceOf(r.distance_km, r.duration_sec))} /km
                        </span>
                      </span>
                    </a>
                  </li>
                ) : null,
              )}
          </ul>
        </section>
      )}

      {advice.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Conseils du coach</h2>
            <a href="#/coach">Tout voir</a>
          </div>
          <ul className="list compact">
            {advice.map((n) => (
              <li key={n.id}>
                <a className="list-row" href="#/coach">
                  <span className="row-main">
                    <span className="row-title">{n.title}</span>
                    <span className="row-sub">{firstLines(n.body)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Dernières sorties</h2>
          <a href="#/course">Tout l’historique</a>
        </div>
        {lastRuns.length === 0 ? (
          <p className="muted">Aucune sortie pour l’instant.</p>
        ) : (
          <>
            <p className="muted">
              4 dernières semaines : {fmt1(recap.km)} km en {recap.runs} {recap.runs > 1 ? 'sorties' : 'sortie'}.
            </p>
            <ul className="list compact">
              {lastRuns.map((r) => (
                <li key={r.id}>
                  <a className="list-row" href={`#/course/${r.id}`}>
                    <span className="date-chip date-chip-run">
                      <span>{fmtWeekday(r.performed_on)}</span>
                      <strong>{fromISODate(r.performed_on).getDate()}</strong>
                    </span>
                    <span className="row-main">
                      <span className="row-title">
                        {fmt1(r.distance_km)} km, {runTypeLabel(r.run_type).toLowerCase()}
                      </span>
                      <span className="row-sub">
                        {fmtClock(r.duration_sec)}, {fmtPace(paceOf(r.distance_km, r.duration_sec))} /km
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <a className="btn btn-outline btn-block" href="#/course/nouvelle">
        <Icon name="plus" size={18} />
        Noter une sortie hors plan
      </a>
    </main>
  )
}
