import assert from 'node:assert/strict'
import { goalGap, pacesFor, predictTime, referenceVdot, vdotOf } from '../src/lib/pace'
import type { Performance, RunnerProfile } from '../src/lib/types'

const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`)

// Repères des tables de Daniels (VDOT 40 et 50)
near(vdotOf(5, 24 * 60 + 8), 40, 0.2, 'VDOT 5 km 24:08')
near(vdotOf(21.0975, 3600 + 50 * 60 + 59), 40, 0.2, 'VDOT semi 1:50:59')
near(predictTime(40, 21.0975), 3600 + 50 * 60 + 59, 20, 'semi prédit VDOT 40')
near(predictTime(50, 10), 41 * 60 + 21, 20, '10 km prédit VDOT 50')

const p40 = pacesFor(40, null)
near(p40.T.fast, 5 * 60 + 2, 6, 'seuil VDOT 40 rapide')
near(p40.T.slow, 5 * 60 + 10, 6, 'seuil VDOT 40 lent')
near((p40.I.fast + p40.I.slow) / 2, 4 * 60 + 42, 4, 'intervalles VDOT 40')
assert.ok(p40.E.fast > p40.S.fast && p40.S.fast > p40.T.fast && p40.T.fast > p40.I.fast && p40.I.fast > p40.R.fast, 'zones ordonnées')
for (const z of ['X', 'E', 'T', 'I', 'R'] as const) {
  const r = p40[z]
  assert.ok(r.target % 5 === 0 && r.target >= r.fast - 3 && r.target <= r.slow + 3, `allure cible fixe ${z} dans la zone`)
}
near(p40.S.fast + 3, (3600 + 50 * 60 + 59) / 21.0975, 3, 'allure semi = prédiction sans objectif')

const profile = { goal_time_sec: 2 * 3600 - 60, race_distance_km: 21.0975 } as RunnerProfile
near(pacesFor(40, profile).S.fast + 3, (2 * 3600 - 60) / 21.0975, 0.01, 'allure semi = objectif')
assert.ok((goalGap(36, profile) ?? 0) > 0, 'objectif plus rapide que le niveau : écart positif')

const perf = (d: string, km: number, s: number): Performance => ({ id: d, performed_on: d, distance_km: km, time_sec: s, kind: 'course', notes: null })
const ref = referenceVdot([perf('2026-01-10', 10, 45 * 60), perf('2026-10-01', 10, 52 * 60), perf('2026-09-15', 5, 25 * 60)], '2026-10-29')
assert.equal(ref?.perf.performed_on, '2026-09-15', 'meilleure perf récente, l’ancienne est ignorée')
const old = referenceVdot([perf('2025-01-10', 10, 45 * 60), perf('2025-06-01', 10, 50 * 60)], '2026-10-29')
assert.equal(old?.perf.performed_on, '2025-06-01', 'sans perf récente : la plus récente')


// Sans chrono : niveau estimé d'après les sorties récentes (2 km et plus, 120 jours).
{
  const { estimatedVdot } = await import('../src/lib/recap')
  const run = (d: string, km: number, s: number) => ({ performed_on: d, distance_km: km, duration_sec: s }) as never
  near(estimatedVdot([run('2026-09-30', 2.63, 760), run('2026-10-16', 3.01, 954)], '2026-10-29')!, 38.2, 0.2, 'meilleure sortie récente')
  assert.equal(estimatedVdot([run('2026-05-01', 10, 2400)], '2026-10-29'), null, 'sortie trop ancienne ignorée')
  assert.equal(estimatedVdot([run('2026-10-20', 1.5, 400)], '2026-10-29'), null, 'sortie trop courte ignorée')
}

console.log('pace : tous les tests passent')
