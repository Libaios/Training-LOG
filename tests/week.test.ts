import assert from 'node:assert/strict'
import { dayAdvice, sortSessions } from '../src/lib/week'
import type { PlanSession, Run } from '../src/lib/types'

// Semaine du lundi 2 au dimanche 8 novembre 2026 : une rapide et une lente, rangées au dimanche.
const session = (id: string, type: PlanSession['session_type'], km: number, status: PlanSession['status'] = 'prevue'): PlanSession => ({
  id,
  scheduled_on: '2026-11-08',
  session_type: type,
  title: id,
  description: null,
  structure: [],
  target_distance_km: km,
  target_duration_min: null,
  phase: 'base',
  week_number: 2,
  status,
  run_id: null,
  locked: false,
  source: 'coach',
  coach_comment: null,
  flexible: true,
  updated_at: '',
})
const run = (date: string): Run => ({
  id: date,
  performed_on: date,
  run_type: 'endurance',
  distance_km: 5,
  duration_sec: 1800,
  avg_hr: null,
  notes: null,
  created_at: '',
  planned_session_id: null,
  rpe: null,
  source: 'manuel',
})

const rapide = session('Rapide', 'fractionne', 6)
const lente = session('Lente', 'sortie_longue', 8)
const week = [lente, rapide]
const next = session('Suivante', 'cotes', 6)

assert.deepEqual(sortSessions(week).map((s) => s.id), ['Rapide', 'Lente'], 'la rapide avant la lente')

// Mardi, dernière sortie samedi : on peut courir.
assert.equal(dayAdvice('2026-11-03', week, [run('2026-10-31')], next).tone, 'go')
// Mardi, couru lundi : repos.
assert.equal(dayAdvice('2026-11-03', week, [run('2026-11-02')], next).tone, 'rest')
// Couru aujourd'hui : sortie faite.
assert.equal(dayAdvice('2026-11-03', week, [run('2026-11-03')], next).tone, 'done')
// Samedi, 2 séances restantes : une seule, la lente.
const sat = dayAdvice('2026-11-07', week, [run('2026-11-04')], next)
assert.equal(sat.tone, 'go')
assert.match(sat.detail, /« Lente »/)
// Samedi, couru vendredi, 2 séances : repos, et seulement la lente dimanche.
const satRest = dayAdvice('2026-11-07', week, [run('2026-11-06')], next)
assert.equal(satRest.tone, 'rest')
assert.match(satRest.detail, /seulement « Lente »/)
// Tout est fait : semaine bouclée, avec la suivante.
const allDone = dayAdvice('2026-11-05', [session('A', 'fractionne', 6, 'faite'), session('B', 'sortie_longue', 8, 'faite')], [run('2026-11-04')], next)
assert.equal(allDone.tone, 'done')
assert.match(allDone.detail, /« Suivante »/)
// Reprise après une longue pause : le conseil le rappelle.
assert.match(dayAdvice('2026-11-03', week, [run('2026-10-16')], next).detail, /18 jours/)
// Jour de course.
const race = { ...session('Semi', 'course', 21.1), flexible: false, scheduled_on: '2026-11-08' }
assert.equal(dayAdvice('2026-11-08', [race], [], undefined).tone, 'race')

// Semaine de course : footing libre + course le dimanche.
const footing = session('Footing', 'footing', 4)
const raceWeek = [footing, race]
assert.match(dayAdvice('2026-11-03', raceWeek, [run('2026-11-01')], undefined).detail, /d’ici 6 nov\./)
assert.equal(dayAdvice('2026-11-07', raceWeek, [run('2026-11-05')], undefined).tone, 'rest', 'repos la veille de la course')
assert.notEqual(dayAdvice('2026-11-06', raceWeek, [run('2026-11-03')], undefined).detail.includes('« Semi » aujourd’hui'), true)

console.log('semaine : tous les tests passent')
