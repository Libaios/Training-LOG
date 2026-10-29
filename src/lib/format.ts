const nf = (max: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max })
const nf0 = nf(0)
const nf1 = nf(1)
const nf2 = nf(2)

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Accepte "42,5" comme "42.5". Renvoie null si vide ou invalide. */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseIntOrNull(value: string): number | null {
  const v = value.trim()
  if (v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

export const fmtInt = (n: number) => nf0.format(n)
export const fmt1 = (n: number) => nf1.format(n)
export const fmtKg = (n: number) => `${nf2.format(n)} kg`
export const fmtKm = (n: number) => `${nf2.format(n)} km`

/** Saisie : nombre sans séparateur de milliers, virgule décimale. */
export function toInput(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return String(n).replace('.', ',')
}

export function fmtDuration(totalSec: number): string {
  const s = Math.round(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h} h ${mm}` : `${mm}:${ss}`
}

/** Durée longue lisible : 1 h 05 min 30 s → "1:05:30". */
export function fmtClock(totalSec: number): string {
  const s = Math.round(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

/** Allure en secondes par km → "5:43". */
export function fmtPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '–'
  let m = Math.floor(secPerKm / 60)
  let s = Math.round(secPerKm % 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function paceOf(distanceKm: number, durationSec: number): number {
  return distanceKm > 0 ? durationSec / distanceKm : NaN
}

/* Dates : on manipule des chaînes "AAAA-MM-JJ" en heure locale. */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = () => toISODate(new Date())

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Lundi de la semaine de la date donnée. */
export function weekStart(iso: string): string {
  const d = fromISODate(iso)
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift)
  return toISODate(d)
}

const dfDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const dfLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const dfShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const dfMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const dfWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })

export const fmtDate = (iso: string) => dfDay.format(fromISODate(iso))
export const fmtDateLong = (iso: string) => capitalize(dfLong.format(fromISODate(iso)))
export const fmtDateShort = (iso: string) => dfShort.format(fromISODate(iso))
export const fmtMonth = (iso: string) => capitalize(dfMonth.format(fromISODate(iso)))
export const fmtWeekday = (iso: string) => dfWeekday.format(fromISODate(iso)).replace('.', '')

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${fmtInt(n)} ${n > 1 ? pluralForm : singular}`
}

/** Durée de séance arrondie à la minute : "45 min", "1 h 05". */
export function fmtMinutes(totalSec: number): string {
  const m = Math.round(totalSec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

/** Secondes → champs h / min / s d'une saisie. */
export function clockFields(totalSec: number): { hours: string; minutes: string; seconds: string } {
  const s = Math.round(totalSec)
  return {
    hours: s >= 3600 ? String(Math.floor(s / 3600)) : '',
    minutes: String(Math.floor((s % 3600) / 60)),
    seconds: String(s % 60),
  }
}

/** Allure (s/km) → champs min / s d'une saisie. */
export function paceFields(secPerKm: number): { min: string; sec: string } {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return { min: '', sec: '' }
  const t = Math.round(secPerKm)
  return { min: String(Math.floor(t / 60)), sec: String(t % 60).padStart(2, '0') }
}
