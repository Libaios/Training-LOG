import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { useToast } from '../lib/ui'
import { Icon } from './Icon'

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function ExercisePicker({ onPick, onClose }: { onPick: (exerciseId: string) => void; onClose: () => void }) {
  const { exercises, addExercise } = useStore()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [onClose])

  const active = exercises.filter((e) => !e.archived)
  const groups = useMemo(
    () => Array.from(new Set(active.map((e) => e.muscle_group).filter(Boolean) as string[])).sort(),
    [active],
  )
  const q = normalize(query.trim())
  const matches = active.filter((e) => !q || normalize(e.name).includes(q) || normalize(e.muscle_group ?? '').includes(q))
  const exact = active.some((e) => normalize(e.name) === q)

  const grouped = new Map<string, typeof matches>()
  for (const e of matches) {
    const key = e.muscle_group || 'Autres'
    grouped.set(key, [...(grouped.get(key) ?? []), e])
  }

  async function create() {
    if (!query.trim()) return
    setBusy(true)
    try {
      const ex = await addExercise(query, group)
      onPick(ex.id)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="picker-title">Choisir un exercice</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <label className="search">
          <Icon name="search" size={18} />
          <input
            ref={input}
            type="search"
            placeholder="Rechercher ou créer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
        </label>
        <div className="sheet-body">
          {query.trim() && !exact && (
            <div className="create-box">
              <p>
                Créer <strong>{query.trim()}</strong>
              </p>
              <div className="row">
                <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Groupe musculaire">
                  <option value="">Groupe (facultatif)</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
                  Créer et ajouter
                </button>
              </div>
            </div>
          )}
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b, 'fr'))
            .map(([g, list]) => (
              <section key={g} className="pick-group">
                <h3>{g}</h3>
                <ul>
                  {list.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => onPick(e.id)}>
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          {!matches.length && !query.trim() && <p className="muted">Aucun exercice. Tape un nom pour en créer un.</p>}
        </div>
      </div>
    </div>
  )
}
