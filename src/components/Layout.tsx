import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { navigate } from '../lib/router'

const TABS = [
  { path: '', label: 'Accueil', icon: 'home' },
  { path: 'muscu', label: 'Muscu', icon: 'dumbbell' },
  { path: 'course', label: 'Course', icon: 'route' },
  { path: 'progres', label: 'Progrès', icon: 'chart' },
  { path: 'reglages', label: 'Réglages', icon: 'sliders' },
]

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {TABS.map((t) => (
        <a
          key={t.label}
          href={`#/${t.path}`}
          className={`tab tab-${t.path || 'accueil'}`}
          aria-current={active === t.path ? 'page' : undefined}
        >
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </a>
      ))}
    </nav>
  )
}

/** En-tête des écrans principaux. */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {action}
    </header>
  )
}

/** En-tête des écrans de saisie, avec retour. */
export function EditorHeader({
  title,
  backTo,
  backLabel = 'Retour',
  action,
}: {
  title: string
  backTo: string
  backLabel?: string
  action?: ReactNode
}) {
  return (
    <header className="editor-header">
      <button type="button" className="icon-text" onClick={() => navigate(backTo)}>
        <Icon name="back" size={20} />
        <span>{backLabel}</span>
      </button>
      <h1>{title}</h1>
      <div className="editor-header-action">{action}</div>
    </header>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action}
    </div>
  )
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden />
      <span>Chargement…</span>
    </div>
  )
}
