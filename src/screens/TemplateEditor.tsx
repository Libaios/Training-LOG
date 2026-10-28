import { useCallback, useEffect, useState } from 'react'
import { EditorHeader, Empty } from '../components/Layout'
import { ExercisePicker } from '../components/ExercisePicker'
import { Icon } from '../components/Icon'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/supabase'
import { uid } from '../lib/format'
import type { Template, TemplateDraftItem } from '../lib/types'
import { useToast } from '../lib/ui'
import { navigate } from '../lib/router'

const itemsFrom = (t: Template): TemplateDraftItem[] =>
  [...t.items]
    .sort((a, b) => a.position - b.position)
    .map((it) => ({
      key: uid(),
      exerciseId: it.exercise_id,
      targetSets: it.target_sets === null ? '' : String(it.target_sets),
      targetReps: it.target_reps ?? '',
    }))

export function TemplateEditor({ id }: { id?: string }) {
  const { templates, exerciseById, saveTemplate, deleteTemplate, loading } = useStore()
  const toast = useToast()
  const existing = id ? templates.find((t) => t.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [items, setItems] = useState<TemplateDraftItem[]>(existing ? itemsFrom(existing) : [])
  const [loadedId, setLoadedId] = useState(existing?.id)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closePicker = useCallback(() => setPicking(false), [])

  useEffect(() => {
    if (existing && loadedId !== existing.id) {
      setName(existing.name)
      setItems(itemsFrom(existing))
      setLoadedId(existing.id)
    }
  }, [existing, loadedId])

  if (id && !existing) {
    if (loading) return null
    return (
      <main className="screen">
        <EditorHeader title="Modèle" backTo="reglages" />
        <Empty>Ce modèle n’existe plus.</Empty>
      </main>
    )
  }

  const setItem = (key: string, patch: Partial<TemplateDraftItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  function move(key: string, delta: number) {
    setItems((list) => {
      const i = list.findIndex((it) => it.key === key)
      const j = i + delta
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function save() {
    if (!name.trim()) return setError('Donne un nom au modèle.')
    if (!items.length) return setError('Ajoute au moins un exercice.')
    setBusy(true)
    setError(null)
    try {
      await saveTemplate(name, items, id)
      toast('Modèle enregistré')
      navigate('reglages', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !window.confirm('Supprimer ce modèle ? Les séances déjà enregistrées ne sont pas touchées.')) return
    setBusy(true)
    try {
      await deleteTemplate(id)
      toast('Modèle supprimé')
      navigate('reglages', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="screen editor">
      <EditorHeader
        title={id ? 'Modèle' : 'Nouveau modèle'}
        backTo="reglages"
        action={
          id && (
            <button type="button" className="icon-btn danger" onClick={remove} aria-label="Supprimer le modèle" disabled={busy}>
              <Icon name="trash" />
            </button>
          )
        }
      />

      <label className="field">
        <span>Nom</span>
        <input type="text" placeholder="Ex. Jambes et fessiers" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {items.length > 0 && (
        <ol className="template-items">
          {items.map((it, index) => (
            <li key={it.key} className="template-item">
              <div className="template-item-head">
                <strong>{exerciseById.get(it.exerciseId)?.name ?? 'Exercice supprimé'}</strong>
                <div className="block-tools">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(it.key, -1)}
                    disabled={index === 0}
                    aria-label="Monter"
                  >
                    <Icon name="up" size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(it.key, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Descendre"
                  >
                    <Icon name="down" size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
                    aria-label="Retirer"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>
              <div className="template-targets">
                <label>
                  <span>Séries</span>
                  <input
                    inputMode="numeric"
                    placeholder="3"
                    value={it.targetSets}
                    onChange={(e) => setItem(it.key, { targetSets: e.target.value.replace(/[^\d]/g, '') })}
                  />
                </label>
                <label>
                  <span>Reps visées</span>
                  <input
                    type="text"
                    placeholder="8 ou 8-12"
                    value={it.targetReps}
                    onChange={(e) => setItem(it.key, { targetReps: e.target.value })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="btn btn-outline btn-block add-exercise" onClick={() => setPicking(true)}>
        <Icon name="plus" size={18} />
        Ajouter un exercice
      </button>

      <div className="save-bar">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="save-bar-row">
          <span className="save-summary muted">
            {items.length} exercice{items.length > 1 ? 's' : ''}
          </span>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le modèle'}
          </button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onPick={(exerciseId) => {
            setPicking(false)
            setItems((list) => [...list, { key: uid(), exerciseId, targetSets: '3', targetReps: '' }])
          }}
          onClose={closePicker}
        />
      )}
    </main>
  )
}
