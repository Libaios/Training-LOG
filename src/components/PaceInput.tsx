/** Saisie d'une allure en min:s par km, mêmes champs que la durée. */
export function PaceInput({
  min,
  sec,
  onChange,
  legend = 'Rythme (min/km)',
}: {
  min: string
  sec: string
  onChange: (min: string, sec: string) => void
  legend?: string
}) {
  const digits = (v: string) => v.replace(/[^\d]/g, '').slice(0, 2)
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="duration pace-input">
        <label>
          <input inputMode="numeric" placeholder="0" value={min} onChange={(e) => onChange(digits(e.target.value), sec)} />
          <span>min</span>
        </label>
        <label>
          <input inputMode="numeric" placeholder="00" value={sec} onChange={(e) => onChange(min, digits(e.target.value))} />
          <span>s</span>
        </label>
        <span className="pace-input-unit muted">/km</span>
      </div>
    </fieldset>
  )
}

/** Champs min / s → secondes par km, null si vide ou invalide. */
export function paceFromFields(min: string, sec: string): number | null {
  if (!min.trim() && !sec.trim()) return null
  const m = Number(min || 0)
  const s = Number(sec || 0)
  if (!Number.isFinite(m) || !Number.isFinite(s) || s >= 60) return null
  const total = m * 60 + s
  return total > 0 ? total : null
}
