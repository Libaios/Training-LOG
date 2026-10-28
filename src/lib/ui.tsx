import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/* Petit message de confirmation en bas d'écran ------------------------------------ */

type Toast = { id: number; text: string; tone: 'ok' | 'error' }
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), text, tone })
    timer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 5000 : 2600)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/* Couleurs des graphiques, lues dans les variables CSS (clair / sombre) ------------ */

export type ChartColors = { strength: string; run: string; grid: string; axis: string; surface: string; ink: string }

function readColors(): ChartColors {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    strength: v('--chart-strength'),
    run: v('--chart-run'),
    grid: v('--line'),
    axis: v('--muted'),
    surface: v('--surface'),
    ink: v('--ink'),
  }
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setColors(readColors())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return colors
}

/* Stockage local tolérant (navigation privée, stockage bloqué) ---------------------- */

export function readLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage indisponible : on continue sans brouillon */
  }
}

export const WORKOUT_DRAFT_KEY = 'training-log.workout-draft'
