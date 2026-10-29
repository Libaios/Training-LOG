import { Icon } from '../components/Icon'
import { KeyPace, SessionSteps } from '../components/Session'
import { SessionComments } from '../components/SessionComments'
import { dayAdvice, daysUntil, isTodo, plannedKm, runsKmBetween, sortSessions, useCoach, weekLabel } from '../lib/coach'
import { useStore } from '../lib/store'
import { addDays, fmt1, fmtClock, fmtDate, fmtDateLong, fmtPace, paceOf, todayISO, weekStart } from '../lib/format'
import { phaseLabel, runTypeLabel, SESSION_KIND, sessionTone, sessionTypeLabel, type PlanSession } from '../lib/types'

const NOTE_LABEL = { plan: 'Plan', bilan: 'Bilan', reprogrammation: 'Réajustement', conseil: 'Conseil' } as const

const excerpt = (text: string, max = 220) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')}…` : flat
}

/** Une séance de la semaine : à faire (déroulé + bouton), faite ou sautée. */
function WeekSession({ session }: { session: PlanSession }) {
  const { runs } = useStore()
  const tone = sessionTone(session.session_type)
  const run = session.run_id ? runs.find((r) => r.id === session.run_id) : undefined
  const todo = isTodo(session)

  return (
    <article className={`week-card tone-${tone}${todo ? '' : ` is-${session.status}`}`}>
      <div className="week-card-head">
        <span className={`stag stag-${tone}`}>{SESSION_KIND[tone]}</span>
        <span className="muted">{session.flexible ? sessionTypeLabel(session.session_type) : fmtDate(session.scheduled_on)}</span>
      </div>
      <h3>{session.title}</h3>
      {todo && <KeyPace session={session} />}

      {session.status === 'faite' ? (
        <a className="done-line" href={run ? `#/course/${run.id}` : `#/seance/${session.id}`}>
          <Icon name="check" size={18} />
          <span>
            {run
              ? `Faite ${fmtDate(run.performed_on).toLowerCase()} : ${fmt1(run.distance_km)} km, ${fmtPace(paceOf(run.distance_km, run.duration_sec))} /km`
              : 'Faite'}
          </span>
        </a>
      ) : session.status === 'sautee' ? (
        <a className="done-line is-skipped" href={`#/seance/${session.id}`}>
          <span>Pas faite</span>
        </a>
      ) : (
        <>
          {session.structure.length > 1 && <SessionSteps steps={session.structure} />}
          {session.coach_comment && <p className="coach-quote">{session.coach_comment}</p>}
          <div className="today-actions">
            <a className="btn btn-primary" href={`#/course/nouvelle/${session.id}`}>
              <Icon name="check" size={18} />
              Je l’ai faite
            </a>
            <a className="btn btn-text" href={`#/seance/${session.id}`}>
              Modifier ou sauter
            </a>
          </div>
          <SessionComments session={session} />
        </>
      )}
    </article>
  )
}

export function Today() {
  const { profile, plan, runs, coachNotes, performances } = useStore()
  const { paces, estimated } = useCoach()
  const today = todayISO()
  const monday = weekStart(today)
  const nextMonday = addDays(monday, 7)
  const week = sortSessions(plan.filter((s) => s.scheduled_on >= monday && s.scheduled_on < nextMonday))
  const next = sortSessions(plan.filter((s) => s.scheduled_on >= nextMonday && isTodo(s)))[0]
  const advice = dayAdvice(today, week, runs, next)
  const raceIn = profile ? daysUntil(profile.race_date) : null
  const phase = week.find((s) => s.phase)?.phase ?? null
  const weekNumber = week.find((s) => s.week_number)?.week_number ?? null
  const lastWeek = plan.reduce((m, s) => Math.max(m, s.week_number ?? 0), 0)
  const done = week.filter((s) => s.status === 'faite').length
  const counted = week.filter((s) => s.status !== 'sautee').length
  const extra = runs.filter((r) => r.performed_on >= monday && r.performed_on < nextMonday && !r.planned_session_id)
  const note = coachNotes[0]
  const hasPlan = plan.some((s) => s.scheduled_on >= monday)

  return (
    <main className="screen today">
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
        {weekNumber && (
          <p className="muted">
            Semaine {weekNumber}
            {lastWeek ? ` sur ${lastWeek}` : ''}
            {phase ? `, phase ${phaseLabel(phase).toLowerCase()}` : ''}
          </p>
        )}
      </header>

      {!hasPlan ? (
        <section className="onboarding">
          <h2>Préparer ton plan</h2>
          <ol>
            <li className={performances.length ? 'is-done' : ''}>
              <a href="#/profil">Ajoute un chrono récent</a> (course ou sortie à fond) : tes allures en découlent.
            </li>
            <li>
              <a href="#/coach">Demande ton plan au coach</a>, il te répond dans quelques minutes.
            </li>
          </ol>
        </section>
      ) : (
        <>
          <section className={`verdict verdict-${advice.tone}`} aria-live="polite">
            <p className="verdict-title">{advice.title}</p>
            <p>{advice.detail}</p>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Cette semaine</h2>
              <span className="muted">
                {done}/{counted} faites, {fmt1(runsKmBetween(runs, monday, nextMonday))} / {fmt1(plannedKm(week))} km
              </span>
            </div>
            <p className="muted week-sub">
              {weekLabel(today).replace(/^du/, 'Du')}, les jours que tu veux. Au moins un jour de repos entre deux séances.
            </p>
            {week.map((s) => (
              <WeekSession key={s.id} session={s} />
            ))}
            {extra.length > 0 && (
              <ul className="list compact">
                {extra.map((r) => (
                  <li key={r.id}>
                    <a className="list-row" href={`#/course/${r.id}`}>
                      <span className="row-main">
                        <span className="row-title">Hors plan : {runTypeLabel(r.run_type).toLowerCase()}</span>
                        <span className="row-sub">
                          {fmtDate(r.performed_on)}, {fmt1(r.distance_km)} km en {fmtClock(r.duration_sec)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {(!paces || estimated) && (
              <p className="muted week-sub">
                {paces ? 'Allures estimées d’après tes dernières sorties, plutôt prudentes.' : 'Allures au ressenti pour l’instant.'}{' '}
                <a href="#/profil">Ajoute un chrono récent</a> pour les {paces ? 'affiner' : 'avoir en min/km'}.
              </p>
            )}
            {next && (
              <p className="muted week-sub">
                Semaine prochaine : {next.title}
                {week.length ? ', et la suite dans le Plan.' : '.'}
              </p>
            )}
          </section>
        </>
      )}

      {note && (
        <section className="section">
          <div className="section-head">
            <h2>Le mot du coach</h2>
            <a href="#/coach">Tout voir</a>
          </div>
          <a className={`note note-link${note.read ? '' : ' is-new'}`} href="#/coach">
            <span className="note-head">
              <span className="stag stag-neutral">{NOTE_LABEL[note.kind]}</span>
              <span className="muted">{note.read ? fmtDate(note.created_at.slice(0, 10)) : 'Nouveau'}</span>
            </span>
            <strong className="note-title">{note.title}</strong>
            <span className="muted">{excerpt(note.body)}</span>
          </a>
        </section>
      )}

      <a className="btn btn-outline btn-block" href="#/course/nouvelle">
        <Icon name="plus" size={18} />
        Noter une sortie hors plan
      </a>
    </main>
  )
}
